import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { pageQuery, toPageResult } from '../../common/pagination';
import { kstDaysBetween, toKstIso } from '../../common/time';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { refreshRestaurantStat } from '../restaurant/restaurant-stat-calc';
import { RestaurantError } from '../restaurant/restaurant.errors';

// LIST-01~03 저장한 맛집 (피그마 "맛집 리스트": 가고 싶은 곳 / 정복한 곳, 저장 목록 하나 — ERD saved_restaurant)
// 정복한 곳 = 저장한 가게 중 한 번이라도(어느 시즌이든) 정복한 가게

export const savedListQuery = z.object({
  ...pageQuery,
  tab: z.enum(['WANT', 'CONQUERED'], { error: 'INVALID_SAVED_TAB' }).default('WANT'),
});
export type SavedListQuery = z.infer<typeof savedListQuery>;

export const savedParams = z.object({ restaurantId: z.coerce.number().int().positive() });

export const saveBody = z.object({
  memo: z.string().trim().max(50, { error: 'MEMO_TOO_LONG' }).nullable().optional(),
  remind: z.boolean().optional(),
});
export type SaveBody = z.infer<typeof saveBody>;

/** 지도 핀은 이만큼까지 (목록과 따로 한 번에) */
const MAX_PINS = 300;

const restaurantSelect = {
  select: {
    id: true,
    name: true,
    lat: true,
    lng: true,
    status: true,
    category: { select: { name: true } },
    sigungu: { select: { name: true, parent: { select: { name: true } } } },
    region: { select: { name: true } },
  },
} as const;

/** LIST-01 저장한 맛집 — 탭 분류·정렬·페이지를 DB에서 (저장 목록 전체를 읽지 않는다) */
export async function listSaved(userId: bigint, query: SavedListQuery, now = new Date()) {
  const want = query.tab === 'WANT';
  const lastConquest = Prisma.sql`(SELECT MAX(c.conquered_at) FROM conquest c
    WHERE c.user_id = s.user_id AND c.restaurant_id = s.restaurant_id)`;
  const [pageRows, [summary], pinRows] = await Promise.all([
    prisma.$queryRaw<{ restaurant_id: bigint; conquered_at: Date | null }[]>`
      SELECT s.restaurant_id, ${lastConquest} AS conquered_at FROM saved_restaurant s
      WHERE s.user_id = ${userId} AND ${lastConquest} IS ${want ? Prisma.sql`NULL` : Prisma.sql`NOT NULL`}
      ORDER BY ${want ? Prisma.sql`s.reg_date ASC, s.restaurant_id ASC` : Prisma.sql`conquered_at DESC, s.restaurant_id DESC`}
      LIMIT ${query.size} OFFSET ${(query.page - 1) * query.size}`,
    prisma.$queryRaw<{ total: bigint; conquered: bigint | null }[]>`
      SELECT COUNT(*) AS total, SUM(${lastConquest} IS NOT NULL) AS conquered
      FROM saved_restaurant s WHERE s.user_id = ${userId}`,
    prisma.$queryRaw<{ restaurant_id: bigint; conquered: bigint }[]>`
      SELECT s.restaurant_id, ${lastConquest} IS NOT NULL AS conquered FROM saved_restaurant s
      WHERE s.user_id = ${userId} ORDER BY s.reg_date DESC, s.restaurant_id DESC LIMIT ${MAX_PINS}`,
  ]);
  const ids = [...new Set([...pageRows, ...pinRows].map((r) => r.restaurant_id))];
  const saved = await prisma.savedRestaurant.findMany({
    where: { userId, restaurantId: { in: ids } },
    include: { restaurant: restaurantSelect },
  });
  const savedOf = new Map(saved.map((s) => [s.restaurantId.toString(), s]));

  const items = pageRows.flatMap((row) => {
    const s = savedOf.get(row.restaurant_id.toString());
    if (!s) return [];
    const r = s.restaurant;
    return [
      {
        restaurantId: r.id,
        name: r.name,
        categoryName: r.category?.name ?? null,
        regionLabel: `${r.sigungu.parent?.name ?? ''} ${r.sigungu.name}`.trim(),
        dongName: r.region.name,
        lat: r.lat.toNumber(),
        lng: r.lng.toNumber(),
        isClosed: r.status === 'C',
        memo: s.memo,
        remind: s.remind,
        savedAt: toKstIso(s.regDate),
        savedDaysAgo: kstDaysBetween(s.regDate, now),
        conqueredAt: row.conquered_at ? toKstIso(row.conquered_at) : null,
      },
    ];
  });
  const totalCount = Number(summary?.total ?? 0);
  const conqueredCount = Number(summary?.conquered ?? 0);
  return {
    summary: { totalCount, wantCount: totalCount - conqueredCount, conqueredCount },
    pins: pinRows.flatMap((row) => {
      const s = savedOf.get(row.restaurant_id.toString());
      if (!s) return [];
      return [
        {
          restaurantId: s.restaurant.id,
          name: s.restaurant.name,
          lat: s.restaurant.lat.toNumber(),
          lng: s.restaurant.lng.toNumber(),
          conquered: Boolean(Number(row.conquered)),
        },
      ];
    }),
    ...toPageResult(items, {
      page: query.page,
      size: query.size,
      totalCount: want ? totalCount - conqueredCount : conqueredCount,
    }),
  };
}

/** LIST-02 저장 (이미 저장했으면 메모·알림만 바꾼다) */
export async function saveRestaurant(
  userId: bigint,
  restaurantId: number,
  body: SaveBody,
  now = new Date(),
) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: BigInt(restaurantId) },
    select: { id: true, status: true },
  });
  if (!restaurant || restaurant.status === 'H')
    throw new AppError(RestaurantError.RESTAURANT_NOT_FOUND);
  const memo = body.memo === undefined ? undefined : body.memo || null;
  const row = await prisma.$transaction(async (tx) => {
    const row = await tx.savedRestaurant.upsert({
      where: { userId_restaurantId: { userId, restaurantId: restaurant.id } },
      update: { memo, remind: body.remind },
      create: {
        userId,
        restaurantId: restaurant.id,
        memo: memo ?? null,
        remind: body.remind ?? true,
        regDate: now,
      },
    });
    await refreshRestaurantStat(tx, restaurant.id, now);
    return row;
  });
  return {
    restaurantId: row.restaurantId,
    isSaved: true,
    memo: row.memo,
    remind: row.remind,
    savedAt: toKstIso(row.regDate),
  };
}

/** LIST-03 저장 취소 (멱등) */
export async function unsaveRestaurant(userId: bigint, restaurantId: number, now = new Date()) {
  const id = BigInt(restaurantId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.savedRestaurant.deleteMany({ where: { userId, restaurantId: id } });
    if (count > 0) await refreshRestaurantStat(tx, id, now);
  });
  return { restaurantId: id, isSaved: false };
}
