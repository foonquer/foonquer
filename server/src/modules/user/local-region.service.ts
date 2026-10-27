import { withObjectParticle } from '../../common/josa';
import { AppError } from '../../common/errors/app-error';
import { type CurrentSeason, findCurrentSeason } from '../../common/season';
import {
  addDays,
  formatDbDate,
  kstStartOfDbDate,
  toKoreanMonthDay,
  toKstIso,
} from '../../common/time';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { requireSeoulDong } from '../region/region.service';
import { LOCAL_REGION_ALREADY_ADDED, UserError } from './user.errors';

type Db = Prisma.TransactionClient | typeof prisma;

/** 내 동네는 최소 1곳, 최대 3곳 */
export const LOCAL_REGION_MIN = 1;
export const LOCAL_REGION_MAX = 3;

/** LOCAL-01 items[] 한 줄 (USER-03·04, SET-01에서도 같은 형태) */
export async function listLocalRegions(userId: bigint, db: Db = prisma) {
  const rows = await db.memberLocalRegion.findMany({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
    include: {
      region: { select: { name: true } },
      sigungu: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    localRegionId: r.id,
    regionId: r.regionId,
    dongName: r.region.name,
    sigunguId: r.sigunguId,
    sigunguName: r.sigungu.name,
    sortOrder: r.sortOrder,
    regDate: toKstIso(r.regDate),
  }));
}

/**
 * 이번 시즌에 내 동네를 바꿀 수 있는지. 추가·삭제 모두 한 시즌에 한 번이고, 회원가입 때 고른 것은 세지 않는다.
 * local_changed_at이 없거나 진행 중 시즌 시작(KST 0시)보다 앞이면 바꿀 수 있다. 진행 중 시즌이 없으면 제한하지 않는다.
 */
export function changeAvailability(localChangedAt: Date | null, season: CurrentSeason | null) {
  if (!localChangedAt || !season || localChangedAt < kstStartOfDbDate(season.startDate)) {
    return { canChange: true, nextChangeAvailableAt: null };
  }
  return {
    canChange: false,
    nextChangeAvailableAt: formatDbDate(addDays(season.endDate, 1)),
  };
}

/** LOCAL-01 내 동네 목록 조회 */
export async function getLocalRegions(userId: bigint) {
  const [items, member, season] = await Promise.all([
    listLocalRegions(userId),
    prisma.member.findUniqueOrThrow({ where: { id: userId }, select: { localChangedAt: true } }),
    findCurrentSeason(),
  ]);
  return {
    items,
    minCount: LOCAL_REGION_MIN,
    maxCount: LOCAL_REGION_MAX,
    ...changeAvailability(member.localChangedAt, season),
  };
}

/** 동시에 두 번 눌러도 한 번만 바뀌도록 회원 행을 잠그고, 마지막 변경 시각과 진행 중 시즌을 읽는다 */
async function lockMember(tx: Prisma.TransactionClient, userId: bigint) {
  const rows = await tx.$queryRaw<{ local_changed_at: Date | null }[]>`
    SELECT local_changed_at FROM member WHERE id = ${userId} FOR UPDATE`;
  return {
    localChangedAt: rows[0]?.local_changed_at ?? null,
    season: await findCurrentSeason(tx),
  };
}

/** 이번 시즌에 이미 바꿨으면 409 LOCAL_REGION_CHANGE_LIMITED */
function assertCanChange(localChangedAt: Date | null, season: CurrentSeason | null) {
  const availability = changeAvailability(localChangedAt, season);
  if (availability.canChange || !season) return;
  const nextDay = toKoreanMonthDay(kstStartOfDbDate(addDays(season.endDate, 1)));
  throw new AppError(
    UserError.LOCAL_REGION_CHANGE_LIMITED,
    `내 동네는 한 시즌에 한 번만 바꿀 수 있어요. (${nextDay}부터 가능)`,
    { nextChangeAvailableAt: availability.nextChangeAvailableAt },
  );
}

/** LOCAL-02 내 동네 추가 (맨 뒤 순서). 이미 한 방문 인증의 로컬 여부는 바뀌지 않는다 */
export async function addLocalRegion(userId: bigint, regionId: number, now = new Date()) {
  const { dong, sigungu } = await requireSeoulDong(regionId);

  return prisma.$transaction(async (tx) => {
    const { localChangedAt, season } = await lockMember(tx, userId);
    const current = await tx.memberLocalRegion.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
      select: { regionId: true, sortOrder: true },
    });
    // 요청 자체의 문제(이미 있음·가득 참)를 시즌 제한보다 먼저 알려 준다.
    if (current.some((r) => r.regionId === dong.id)) {
      throw new AppError(LOCAL_REGION_ALREADY_ADDED);
    }
    if (current.length >= LOCAL_REGION_MAX) {
      throw new AppError(UserError.LOCAL_REGION_LIMIT_EXCEEDED);
    }
    assertCanChange(localChangedAt, season);

    const created = await tx.memberLocalRegion.create({
      data: {
        userId,
        regionId: dong.id,
        sigunguId: sigungu.id,
        sortOrder: current.length === 0 ? 0 : Math.max(...current.map((r) => r.sortOrder)) + 1,
        regDate: now,
      },
    });
    await tx.member.update({ where: { id: userId }, data: { localChangedAt: now } });

    const items = await listLocalRegions(userId, tx);
    return {
      message: `${sigungu.name} ${withObjectParticle(dong.name)} 내 동네에 추가했어요.`,
      data: {
        added: items.find((i) => i.localRegionId === created.id),
        items,
        ...changeAvailability(now, season),
      },
    };
  });
}

/** LOCAL-03 내 동네 삭제. 남은 동네 순서를 0부터 다시 매긴다 (0번을 지우면 다음 동네가 기본) */
export async function removeLocalRegion(userId: bigint, localRegionId: number, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.memberLocalRegion.findFirst({
      where: { id: BigInt(localRegionId), userId },
      select: { id: true },
    });
    if (!target) throw new AppError(UserError.LOCAL_REGION_NOT_FOUND);

    const { localChangedAt, season } = await lockMember(tx, userId);
    const count = await tx.memberLocalRegion.count({ where: { userId } });
    if (count <= LOCAL_REGION_MIN) throw new AppError(UserError.LOCAL_REGION_MIN_REQUIRED);
    assertCanChange(localChangedAt, season);

    await tx.memberLocalRegion.delete({ where: { id: target.id } });
    // unique(user_id, sort_order)와 CHECK(0~2) 때문에 앞에서부터 빈자리로 한 칸씩 당긴다.
    const rest = await tx.memberLocalRegion.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, sortOrder: true },
    });
    for (const [index, row] of rest.entries()) {
      if (row.sortOrder !== index) {
        await tx.memberLocalRegion.update({ where: { id: row.id }, data: { sortOrder: index } });
      }
    }
    await tx.member.update({ where: { id: userId }, data: { localChangedAt: now } });

    return {
      items: await listLocalRegions(userId, tx),
      ...changeAvailability(now, season),
    };
  });
}
