import { AppError } from '../../common/errors/app-error';
import { distanceBetween } from '../../common/geo';
import { toKstIso } from '../../common/time';
import { prisma } from '../../lib/prisma';
import { notify } from '../notification/notify';
import { RestaurantError } from '../restaurant/restaurant.errors';
import { grantReward } from '../reward/reward.service';
import { assertUploadedImage } from '../upload/uploaded-image';
import { ALLOWED_DISTANCE_M } from '../visit/visit.service';
import { MapaeError } from './mapae.errors';
import type { MapaeObjectionBody, MapaeReportBody } from './mapae.schema';

// 마패 제보·사장님 이의제기 (피그마 ⑥ 마패 신고, M5–M6).
// 방문자가 가게에서(현장인증과 같은 100m 안) 앱 카메라로 리뷰 이벤트 안내문을 찍어 제보하고,
// 30일 안에 서로 다른 방문자 2명이 제보하면 마패를 자동으로 붙이고 제보자마다 +50P(MAPAE_REPORT).
// 사장님 이의제기는 1:1 문의(category MAPAE)로 받아 운영자가 답하고, 필요하면 관리자 화면에서 마패를 해제한다

/** 마패가 붙는 서로 다른 제보자 수 */
export const MAPAE_REPORTERS_NEEDED = 2;
/** 이 기간 안의 제보만 모은다 (일) */
export const MAPAE_REPORT_WINDOW_DAYS = 30;
const AUTO_GRANTED_BY = 'auto:report';
const REWARD_REASON = 'MAPAE_REPORT';

const STATUS_API: Record<string, 'PENDING' | 'CONFIRMED' | 'REJECTED'> = {
  P: 'PENDING',
  C: 'CONFIRMED',
  R: 'REJECTED',
};

const windowStart = (now: Date) =>
  new Date(now.getTime() - MAPAE_REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

async function findReportableRestaurant(restaurantId: number) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: BigInt(restaurantId) },
    select: { id: true, name: true, status: true, lat: true, lng: true, hasMapae: true },
  });
  if (!restaurant || restaurant.status === 'H') {
    throw new AppError(RestaurantError.RESTAURANT_NOT_FOUND);
  }
  return restaurant;
}

/** 아직 마패가 안 붙은 가게의 기간 안 제보자 수 (같은 사람은 한 번) */
async function pendingReporterCount(restaurantId: bigint, now: Date) {
  const rows = await prisma.mapaeReport.findMany({
    where: { restaurantId, status: 'P', regDate: { gte: windowStart(now) } },
    distinct: ['userId'],
    select: { userId: true },
  });
  return rows.length;
}

/** MAPAE-01 마패 제보. 두 번째 방문자 제보면 그 자리에서 마패를 붙이고 제보자들에게 +50P */
export async function createMapaeReport(
  userId: bigint,
  restaurantId: number,
  body: MapaeReportBody,
  now = new Date(),
) {
  const restaurant = await findReportableRestaurant(restaurantId);
  if (restaurant.hasMapae) throw new AppError(MapaeError.MAPAE_ALREADY_SHOWN);
  const distanceM = Math.round(
    distanceBetween(body.lat, body.lng, restaurant.lat.toNumber(), restaurant.lng.toNumber()),
  );
  if (distanceM > ALLOWED_DISTANCE_M) {
    throw new AppError(MapaeError.MAPAE_REPORT_TOO_FAR, undefined, {
      distanceM,
      allowedM: ALLOWED_DISTANCE_M,
    });
  }
  await assertUploadedImage(userId, 'MAPAE', body.photoKey);
  const hasVisit =
    (await prisma.visit.count({
      where: { userId, restaurantId: restaurant.id, status: { in: ['V', 'C'] } },
    })) > 0;

  const result = await prisma.$transaction(async (tx) => {
    // 같은 가게 제보가 동시에 들어와도 마패를 한 번만 붙이게 가게 줄을 잠근다
    const [locked] = await tx.$queryRaw<{ has_mapae: number }[]>`
      SELECT has_mapae FROM restaurant WHERE id = ${restaurant.id} FOR UPDATE`;
    if (locked?.has_mapae) throw new AppError(MapaeError.MAPAE_ALREADY_SHOWN);
    const since = windowStart(now);
    const mine = await tx.mapaeReport.count({
      where: { restaurantId: restaurant.id, userId, status: 'P', regDate: { gte: since } },
    });
    if (mine > 0) throw new AppError(MapaeError.MAPAE_REPORT_DUPLICATE);

    const report = await tx.mapaeReport.create({
      data: {
        restaurantId: restaurant.id,
        userId,
        eventType: body.eventType,
        memo: body.memo || null,
        photoKey: body.photoKey,
        lat: body.lat,
        lng: body.lng,
        distanceM,
        hasVisit,
        regDate: now,
      },
    });
    const pending = await tx.mapaeReport.findMany({
      where: { restaurantId: restaurant.id, status: 'P', regDate: { gte: since } },
      orderBy: { id: 'asc' },
      select: { id: true, userId: true },
    });
    // 사람마다 첫 제보 하나 (보상 기준)
    const firsts = [...new Map(pending.map((p) => [p.userId.toString(), p])).values()];
    if (firsts.length < MAPAE_REPORTERS_NEEDED) {
      return { report, reporterCount: firsts.length, rewardPoint: 0 };
    }

    const mapae = await tx.restaurantMapae.create({
      data: {
        restaurantId: restaurant.id,
        reason: 'E',
        evidence: `방문자 사진 제보 ${firsts.length}건 (위치 확인)`,
        grantedBy: AUTO_GRANTED_BY,
        grantedAt: now,
        regDate: now,
      },
    });
    await tx.restaurant.update({ where: { id: restaurant.id }, data: { hasMapae: true } });
    await tx.mapaeReport.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { status: 'C', mapaeId: mapae.id },
    });
    let rewardPoint = 0;
    for (const first of firsts) {
      const reward = await grantReward(
        tx,
        first.userId,
        REWARD_REASON,
        `${restaurant.name} 마패 제보`,
        { type: 'MAPAE_REPORT', id: first.id },
        now,
      );
      if (first.userId === userId) {
        rewardPoint = reward.point;
        continue;
      }
      await notify(
        tx,
        first.userId,
        {
          category: 'REVIEW',
          type: 'EVENT',
          title: '제보한 가게에 마패가 붙었어요',
          content: `${restaurant.name} · 다른 방문자의 제보로 확인됐어요 (+${reward.point}P)`,
          refType: 'RESTAURANT',
          refId: restaurant.id,
        },
        now,
      );
    }
    return {
      report: { ...report, status: 'C' },
      reporterCount: firsts.length,
      rewardPoint,
    };
  });

  return reportView(result.report, restaurant.name, result.reporterCount, result.rewardPoint);
}

function reportView(
  report: {
    id: bigint;
    restaurantId: bigint;
    eventType: string;
    status: string;
    distanceM: number;
    hasVisit: boolean;
    regDate: Date;
  },
  restaurantName: string,
  reporterCount: number,
  rewardPoint: number,
) {
  return {
    reportId: report.id,
    restaurantId: report.restaurantId,
    restaurantName,
    eventType: report.eventType,
    status: STATUS_API[report.status] ?? report.status,
    distanceM: report.distanceM,
    hasVisit: report.hasVisit,
    /** 지금까지 제보한 서로 다른 방문자 수 (확정이면 그 마패를 붙인 제보자 수) */
    reporterCount,
    reportersNeeded: MAPAE_REPORTERS_NEEDED,
    /** 마패가 확정돼 받은 포인트 (아직이면 0) */
    rewardPoint,
    regDate: toKstIso(report.regDate),
  };
}

/** MAPAE-02 내 제보 접수 현황 */
export async function getMyMapaeReport(userId: bigint, reportId: number, now = new Date()) {
  const report = await prisma.mapaeReport.findUnique({
    where: { id: BigInt(reportId) },
    include: { restaurant: { select: { name: true } } },
  });
  if (!report || report.userId !== userId) {
    throw new AppError(MapaeError.MAPAE_REPORT_NOT_FOUND);
  }
  let reporterCount: number;
  let rewardPoint = 0;
  if (report.status === 'C' && report.mapaeId) {
    const rows = await prisma.mapaeReport.findMany({
      where: { mapaeId: report.mapaeId },
      distinct: ['userId'],
      select: { userId: true },
    });
    reporterCount = rows.length;
    const paid = await prisma.pointHistory.findFirst({
      where: { userId, reason: REWARD_REASON, refType: 'MAPAE_REPORT', refId: report.id },
      select: { amount: true },
    });
    rewardPoint = paid?.amount ?? 0;
  } else {
    reporterCount = await pendingReporterCount(report.restaurantId, now);
  }
  return reportView(report, report.restaurant.name, reporterCount, rewardPoint);
}

/** 음식점 상세의 마패 줄: 지금 붙어 있는 마패가 방문자 제보로 붙었으면 그 제보자 수 (운영자가 붙였으면 0) */
export async function activeMapaeReportCount(restaurantId: bigint) {
  const mapae = await prisma.restaurantMapae.findFirst({
    where: { restaurantId, status: 'A' },
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  if (!mapae) return 0;
  const rows = await prisma.mapaeReport.findMany({
    where: { mapaeId: mapae.id },
    distinct: ['userId'],
    select: { userId: true },
  });
  return rows.length;
}

/** MAPAE-03 사장님 이의제기 — 1:1 문의(category MAPAE)로 받는다. 답변은 문의 답변 알림으로 */
export async function createMapaeObjection(
  userId: bigint,
  restaurantId: number,
  body: MapaeObjectionBody,
  now = new Date(),
) {
  const restaurant = await findReportableRestaurant(restaurantId);
  if (!restaurant.hasMapae) throw new AppError(MapaeError.MAPAE_NOT_SHOWN);
  if (body.imageKey) await assertUploadedImage(userId, 'INQUIRY', body.imageKey);
  const inquiry = await prisma.inquiry.create({
    data: {
      userId,
      category: 'MAPAE',
      content: body.content,
      imageKey: body.imageKey ?? null,
      refRestaurantId: restaurant.id,
      ownerRelation: body.relation,
      objectionReason: body.reason,
      regDate: now,
    },
  });
  return { inquiryId: inquiry.id, status: 'WAITING' };
}
