import { createHash } from 'node:crypto';
import { type Db, lockMember, type Tx } from '../../common/db';
import { AppError } from '../../common/errors/app-error';
import { distanceBetween } from '../../common/geo';
import { findCurrentSeason } from '../../common/season';
import { addSeconds, kstStartOfToday, toKstIso, toKstIsoOrNull } from '../../common/time';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { createReadUrl } from '../../lib/storage';
import { refreshRestaurantStat } from '../restaurant/restaurant-stat-calc';
import { RestaurantError } from '../restaurant/restaurant.errors';
import { grantReward } from '../reward/reward.service';
import { assertUploadedImage } from '../upload/uploaded-image';
import { readReceipt } from './receipt-ocr';
import type { LocationCheckBody, OnSiteBody, ReceiptBody } from './visit.schema';
import { FAIL_MESSAGES, VisitError } from './visit.errors';

/** 현장 인증 허용 거리 (m) — "매장에서 42m · 인증 범위 100m 이내" */
export const ALLOWED_DISTANCE_M = 100;
/** 위치 확인 뒤 음식 사진을 고를 수 있는 시간 (초) */
export const LOCATION_CHECK_TTL_SEC = 600;
/** 사진 EXIF 위치가 가게에서 이보다 멀면 다른 곳 사진으로 본다 (m) */
const PHOTO_DISTANCE_LIMIT_M = 300;
/** 사진 EXIF 촬영 시각이 위치 확인보다 이만큼 이전이면 오래된 사진으로 본다 (시간) */
const PHOTO_MAX_AGE_HOURS = 24;
/** 영수증은 결제 후 7일 안에만 인증 */
const RECEIPT_VALID_DAYS = 7;

const STATUS_API: Record<string, string> = {
  P: 'READING',
  R: 'RESTAURANT_CHECK',
  L: 'LOCATION_CHECKED',
  V: 'VERIFIED',
  C: 'CONQUERED',
  F: 'FAILED',
};
const METHOD_API: Record<string, string> = { R: 'RECEIPT', S: 'ON_SITE' };

async function findOpenRestaurant(restaurantId: number) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: BigInt(restaurantId) },
    select: {
      id: true,
      name: true,
      status: true,
      lat: true,
      lng: true,
      sigunguId: true,
      businessNo: true,
    },
  });
  if (!restaurant || restaurant.status !== 'A')
    throw new AppError(RestaurantError.RESTAURANT_NOT_FOUND);
  return restaurant;
}

/**
 * 같은 가게를 새로 인증할 수 있는지.
 * - 별점을 아직 안 남긴 인증(status V)이 있으면 409 VISIT_PENDING_RATING (data.verificationId)
 * - 오늘(KST) 이미 인증을 마친 가게면 409 ALREADY_VERIFIED_TODAY
 */
async function assertCanVerify(
  userId: bigint,
  restaurantId: bigint,
  now: Date,
  exceptVisitId?: bigint,
  db: Db = prisma,
) {
  const pending = await db.visit.findFirst({
    where: {
      userId,
      restaurantId,
      status: 'V',
      id: exceptVisitId ? { not: exceptVisitId } : undefined,
    },
    select: { id: true },
  });
  if (pending) {
    throw new AppError(VisitError.VISIT_PENDING_RATING, undefined, { verificationId: pending.id });
  }
  const today = await db.visit.findFirst({
    where: {
      userId,
      restaurantId,
      status: { in: ['V', 'C'] },
      verifiedAt: { gte: kstStartOfToday(now) },
    },
    select: { id: true },
  });
  if (today) throw new AppError(VisitError.ALREADY_VERIFIED_TODAY);
}

/**
 * 인증 성공 처리 (현장·영수증 공통): status V, 시즌·로컬 여부 확정, 방문 인증 +50P, 가게 집계.
 * 별점(REVIEW-01)을 남기면 정복이 끝난다.
 */
async function completeVerification(
  tx: Tx,
  visit: { id: bigint; userId: bigint; restaurantId: bigint },
  restaurantName: string,
  sigunguId: number,
  now: Date,
) {
  const [season, local] = await Promise.all([
    findCurrentSeason(tx),
    tx.memberLocalRegion.findFirst({
      where: { userId: visit.userId, sigunguId },
      select: { id: true },
    }),
  ]);
  await tx.visit.update({
    where: { id: visit.id },
    data: {
      status: 'V',
      verifiedAt: now,
      seasonId: season?.id ?? null,
      isLocal: local !== null,
      failReason: null,
    },
  });
  const reward = await grantReward(
    tx,
    visit.userId,
    'VISIT_VERIFIED',
    `${restaurantName} 방문 인증`,
    { type: 'VISIT', id: visit.id },
    now,
  );
  await refreshRestaurantStat(tx, visit.restaurantId, now);
  return reward;
}

/** VISIT-01 현장 위치 확인 */
export async function checkLocation(userId: bigint, body: LocationCheckBody, now = new Date()) {
  const restaurant = await findOpenRestaurant(body.restaurantId);
  await assertCanVerify(userId, restaurant.id, now);
  const distanceM = Math.round(
    distanceBetween(body.lat, body.lng, restaurant.lat.toNumber(), restaurant.lng.toNumber()),
  );
  if (distanceM > ALLOWED_DISTANCE_M) {
    throw new AppError(VisitError.VISIT_TOO_FAR, undefined, {
      distanceM,
      allowedM: ALLOWED_DISTANCE_M,
    });
  }
  const visit = await prisma.visit.create({
    data: {
      userId,
      restaurantId: restaurant.id,
      method: 'S',
      status: 'L',
      checkinLat: body.lat,
      checkinLng: body.lng,
      checkinAccuracy: body.accuracyM ?? null,
      checkinDistanceM: distanceM,
      checkinAt: now,
      regDate: now,
    },
  });
  return {
    verificationId: visit.id,
    restaurantId: restaurant.id,
    distanceM,
    allowedM: ALLOWED_DISTANCE_M,
    expiresAt: toKstIso(addSeconds(now, LOCATION_CHECK_TTL_SEC)),
  };
}

async function findMyVisit(userId: bigint, visitId: number) {
  const visit = await prisma.visit.findUnique({ where: { id: BigInt(visitId) } });
  if (!visit || visit.userId !== userId) throw new AppError(VisitError.VISIT_NOT_FOUND);
  return visit;
}

/** VISIT-02 현장 사진 인증 (위치 확인 다음 단계) */
export async function completeOnSite(
  userId: bigint,
  visitId: number,
  body: OnSiteBody,
  now = new Date(),
) {
  const visit = await findMyVisit(userId, visitId);
  if (visit.method !== 'S' || visit.status !== 'L' || !visit.restaurantId || !visit.checkinAt) {
    throw new AppError(VisitError.INVALID_VISIT_STATE);
  }
  if (addSeconds(visit.checkinAt, LOCATION_CHECK_TTL_SEC) < now) {
    throw new AppError(VisitError.LOCATION_CHECK_EXPIRED);
  }
  const restaurant = await findOpenRestaurant(Number(visit.restaurantId));
  await assertCanVerify(userId, restaurant.id, now, visit.id);
  await assertUploadedImage(userId, 'SITE_PHOTO', body.sitePhotoKey);

  // EXIF가 있으면 보강 검증 (브라우저가 지워서 없으면 위치 확인만으로 통과)
  const takenAt = body.photoTakenAt ? new Date(body.photoTakenAt) : null;
  if (takenAt && takenAt.getTime() < visit.checkinAt.getTime() - PHOTO_MAX_AGE_HOURS * 3600_000) {
    throw new AppError(VisitError.PHOTO_MISMATCH);
  }
  if (body.photoLat !== undefined && body.photoLng !== undefined) {
    const d = distanceBetween(
      body.photoLat,
      body.photoLng,
      restaurant.lat.toNumber(),
      restaurant.lng.toNumber(),
    );
    if (d > PHOTO_DISTANCE_LIMIT_M) throw new AppError(VisitError.PHOTO_MISMATCH);
  }

  const reward = await prisma.$transaction(async (tx) => {
    // 같은 위치 확인으로 두 번 보내도 한 번만 처리되도록 잠그고 상태를 다시 본다
    const [locked] = await tx.$queryRaw<{ status: string }[]>`
      SELECT status FROM visit WHERE id = ${visit.id} FOR UPDATE`;
    if (locked?.status !== 'L') throw new AppError(VisitError.INVALID_VISIT_STATE);
    // 같은 가게 인증이 동시에 두 건 통과하지 않게 회원을 잠그고 다시 본다 (잠금 순서: visit → member)
    await lockMember(tx, userId);
    await assertCanVerify(userId, restaurant.id, now, visit.id, tx);
    await tx.visit.update({
      where: { id: visit.id },
      data: {
        sitePhotoKey: body.sitePhotoKey,
        photoTakenAt: takenAt,
        photoLat: body.photoLat ?? null,
        photoLng: body.photoLng ?? null,
      },
    });
    return completeVerification(
      tx,
      { id: visit.id, userId, restaurantId: restaurant.id },
      restaurant.name,
      restaurant.sigunguId,
      now,
    );
  });
  return {
    verificationId: visit.id,
    status: 'VERIFIED',
    restaurant: { restaurantId: restaurant.id, name: restaurant.name },
    reward: { point: reward.point, levelUp: reward.levelUp },
  };
}

// 영수증 확인은 OCR이 몇 초 걸려서 요청과 따로 돈다. 테스트는 flushReceiptChecks()로 끝날 때까지 기다린다.
const running = new Set<Promise<void>>();

export function scheduleReceiptCheck(visitId: bigint) {
  const job = processReceipt(visitId)
    .catch(async (err: unknown) => {
      console.error(`영수증 확인 실패 visit=${visitId}`, err);
      // READING(P)으로 영원히 남지 않게 실패로 바꾼다 (이미 바뀐 상태는 그대로)
      await prisma.visit
        .updateMany({
          where: { id: visitId, status: 'P' },
          data: { status: 'F', failReason: 'UNREADABLE' },
        })
        .catch((e: unknown) => console.error(`영수증 실패 기록 실패 visit=${visitId}`, e));
    })
    .finally(() => running.delete(job));
  running.add(job);
}

/** 테스트 전용: 돌고 있는 영수증 확인이 모두 끝날 때까지 기다린다 */
export async function flushReceiptChecks() {
  while (running.size > 0) await Promise.all([...running]);
}

/** VISIT-03 영수증 인증 요청 — status P로 접수하고 OCR은 따로 돌린다. 결과는 VISIT-04 */
export async function submitReceipt(userId: bigint, body: ReceiptBody, now = new Date()) {
  const restaurant = await findOpenRestaurant(body.restaurantId);
  await assertCanVerify(userId, restaurant.id, now);
  await assertUploadedImage(userId, 'RECEIPT', body.receiptImageKey);
  const visit = await prisma.visit.create({
    data: {
      userId,
      restaurantId: restaurant.id,
      method: 'R',
      status: 'P',
      receiptImageKey: body.receiptImageKey,
      regDate: now,
    },
  });
  return { verificationId: visit.id, status: STATUS_API.P };
}

/** 가게 이름 비교용: 공백·기호·(주)를 지운다 */
export function normalizeStoreName(name: string) {
  return name
    .replace(/\(주\)|㈜|주식회사/g, '')
    .replace(/[\s()[\]{}·.,\-_'"&/]/g, '')
    .toLowerCase();
}

/** 영수증 가게명이 고른 가게와 같은지 (한쪽이 다른 쪽을 포함하면 같은 가게로 본다: "스이루 중앙대점" ↔ "스이루") */
export function storeNameMatches(receiptName: string, restaurantName: string) {
  const a = normalizeStoreName(receiptName);
  const b = normalizeStoreName(restaurantName);
  if (a.length < 2 || b.length < 2) return false;
  return a.includes(b) || b.includes(a);
}

/** 영수증 OCR → 검증 → 성공이면 인증 완료, 아니면 status F + fail_reason */
export async function processReceipt(visitId: bigint, now = new Date()) {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      restaurant: { select: { id: true, name: true, sigunguId: true, businessNo: true } },
    },
  });
  if (!visit || visit.status !== 'P' || !visit.restaurant || !visit.receiptImageKey) return;
  const restaurant = visit.restaurant;

  const fail = (failReason: string, extra: Prisma.VisitUpdateInput = {}) =>
    prisma.visit.update({ where: { id: visit.id }, data: { status: 'F', failReason, ...extra } });

  const url = await createReadUrl(visit.receiptImageKey, 600);
  const ext = visit.receiptImageKey.split('.').pop() ?? 'jpg';
  const receipt = url ? await readReceipt(url, ext) : null;
  if (
    !receipt ||
    !receipt.paidAt ||
    receipt.totalAmount === null ||
    (!receipt.storeName && !receipt.businessNo)
  ) {
    await fail('UNREADABLE', receipt ? { ocrRaw: receipt.raw as Prisma.InputJsonValue } : {});
    return;
  }

  const ocrFields = {
    ocrRaw: receipt.raw as Prisma.InputJsonValue,
    ocrStoreName: receipt.storeName?.slice(0, 100) ?? null,
    ocrBusinessNo: receipt.businessNo,
    ocrApprovalNo: receipt.approvalNo?.slice(0, 20) ?? null,
    paidAt: receipt.paidAt,
    totalAmount: receipt.totalAmount,
  };
  const ageMs = now.getTime() - receipt.paidAt.getTime();
  if (ageMs > RECEIPT_VALID_DAYS * 86_400_000 || ageMs < -86_400_000) {
    await fail('EXPIRED', ocrFields);
    return;
  }
  const businessNoMatched =
    restaurant.businessNo && receipt.businessNo
      ? restaurant.businessNo === receipt.businessNo
      : null;
  const storeNameMatched = receipt.storeName
    ? storeNameMatches(receipt.storeName, restaurant.name)
    : null;
  const matched =
    businessNoMatched === true || (businessNoMatched === null && storeNameMatched === true);
  if (!matched) {
    await fail('STORE_MISMATCH', { ...ocrFields, storeNameMatched, businessNoMatched });
    return;
  }
  const receiptHash = createHash('sha256')
    .update(
      [
        receipt.businessNo ?? receipt.storeName,
        receipt.paidAt.toISOString(),
        receipt.totalAmount,
        receipt.approvalNo ?? '',
      ].join('|'),
    )
    .digest('hex');

  try {
    await prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM visit WHERE id = ${visit.id} FOR UPDATE`;
      if (locked?.status !== 'P') return;
      // 같은 가게 영수증 두 장이 함께 읽히면 앞의 것만 인증한다
      await lockMember(tx, visit.userId);
      try {
        await assertCanVerify(visit.userId, restaurant.id, now, visit.id, tx);
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        await tx.visit.update({
          where: { id: visit.id },
          data: { ...ocrFields, status: 'F', failReason: 'ALREADY_VERIFIED' },
        });
        return;
      }
      await tx.visit.update({
        where: { id: visit.id },
        data: { ...ocrFields, storeNameMatched, businessNoMatched, receiptHash },
      });
      if (receipt.items.length > 0) {
        await tx.visitReceiptItem.createMany({
          data: receipt.items.map((item) => ({ visitId: visit.id, ...item })),
        });
      }
      // 처음 인증된 영수증의 사업자번호를 가게에 저장해 같은 이름 다른 지점을 구분한다.
      // 이름이 포함 관계로만 맞은 경우(다른 지점일 수 있음)는 저장하지 않는다
      const sameName =
        receipt.storeName !== null &&
        normalizeStoreName(receipt.storeName) === normalizeStoreName(restaurant.name);
      if (!restaurant.businessNo && receipt.businessNo && sameName) {
        await tx.restaurant.update({
          where: { id: restaurant.id },
          data: { businessNo: receipt.businessNo },
        });
      }
      await completeVerification(
        tx,
        { id: visit.id, userId: visit.userId, restaurantId: restaurant.id },
        restaurant.name,
        restaurant.sigunguId,
        now,
      );
    });
  } catch (err) {
    // 같은 영수증(receipt_hash unique)을 이미 다른 인증에 썼다
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      await fail('DUPLICATE', ocrFields);
      return;
    }
    throw err;
  }
}

/** VISIT-04 방문 인증 결과 조회 */
export async function getVerification(userId: bigint, visitId: number, now = new Date()) {
  const visit = await prisma.visit.findUnique({
    where: { id: BigInt(visitId) },
    include: {
      restaurant: { select: { id: true, name: true, category: { select: { name: true } } } },
      visitReceiptItems: { orderBy: { id: 'asc' } },
      review: { select: { id: true } },
    },
  });
  if (!visit || visit.userId !== userId) throw new AppError(VisitError.VISIT_NOT_FOUND);
  const [receiptImageUrl, sitePhotoUrl] = await Promise.all([
    createReadUrl(visit.receiptImageKey),
    createReadUrl(visit.sitePhotoKey),
  ]);
  const expiresAt =
    visit.status === 'L' && visit.checkinAt
      ? addSeconds(visit.checkinAt, LOCATION_CHECK_TTL_SEC)
      : null;
  return {
    verificationId: visit.id,
    method: METHOD_API[visit.method] ?? visit.method,
    status: STATUS_API[visit.status] ?? visit.status,
    failReason: visit.failReason,
    failMessage: visit.failReason ? (FAIL_MESSAGES[visit.failReason] ?? null) : null,
    restaurant: visit.restaurant
      ? {
          restaurantId: visit.restaurant.id,
          name: visit.restaurant.name,
          categoryName: visit.restaurant.category?.name ?? null,
        }
      : null,
    receipt:
      visit.method === 'R'
        ? {
            storeName: visit.ocrStoreName,
            paidAt: toKstIsoOrNull(visit.paidAt),
            totalAmount: visit.totalAmount,
            storeNameMatched: visit.storeNameMatched,
            businessNoMatched: visit.businessNoMatched,
            items: visit.visitReceiptItems.map((i) => ({
              menuName: i.menuName,
              quantity: i.quantity,
              price: i.price,
            })),
          }
        : null,
    onSite:
      visit.method === 'S'
        ? {
            distanceM: visit.checkinDistanceM,
            allowedM: ALLOWED_DISTANCE_M,
            checkedAt: toKstIsoOrNull(visit.checkinAt),
          }
        : null,
    receiptImageUrl,
    sitePhotoUrl,
    isLocal: visit.isLocal,
    verifiedAt: toKstIsoOrNull(visit.verifiedAt),
    expiresAt: expiresAt ? toKstIso(expiresAt) : null,
    isExpired: expiresAt ? expiresAt < now : false,
    canRate: visit.status === 'V',
    reviewId: visit.review?.id ?? null,
  };
}
