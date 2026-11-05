import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { pageQuery, toPageResult } from '../../common/pagination';
import { kstDaysBetween, toKstIso } from '../../common/time';
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

/** LIST-01 저장한 맛집 */
export async function listSaved(userId: bigint, query: SavedListQuery, now = new Date()) {
  const saved = await prisma.savedRestaurant.findMany({
    where: { userId },
    include: {
      restaurant: {
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
      },
    },
  });
  const conquests = await prisma.conquest.groupBy({
    by: ['restaurantId'],
    where: { userId, restaurantId: { in: saved.map((s) => s.restaurantId) } },
    _max: { conqueredAt: true },
  });
  const conqueredAt = new Map(
    conquests.map((c) => [c.restaurantId.toString(), c._max.conqueredAt]),
  );
  const want = saved
    .filter((s) => !conqueredAt.has(s.restaurantId.toString()))
    .sort((a, b) => a.regDate.getTime() - b.regDate.getTime()); // 오래 저장한 순
  const conquered = saved
    .filter((s) => conqueredAt.has(s.restaurantId.toString()))
    .sort(
      (a, b) =>
        (conqueredAt.get(b.restaurantId.toString())?.getTime() ?? 0) -
        (conqueredAt.get(a.restaurantId.toString())?.getTime() ?? 0),
    ); // 최근 정복한 순

  const list = query.tab === 'WANT' ? want : conquered;
  const start = (query.page - 1) * query.size;
  const items = list.slice(start, start + query.size).map((s) => {
    const r = s.restaurant;
    const at = conqueredAt.get(s.restaurantId.toString()) ?? null;
    return {
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
      conqueredAt: at ? toKstIso(at) : null,
    };
  });
  return {
    summary: { totalCount: saved.length, wantCount: want.length, conqueredCount: conquered.length },
    pins: saved.slice(0, MAX_PINS).map((s) => ({
      restaurantId: s.restaurant.id,
      name: s.restaurant.name,
      lat: s.restaurant.lat.toNumber(),
      lng: s.restaurant.lng.toNumber(),
      conquered: conqueredAt.has(s.restaurantId.toString()),
    })),
    ...toPageResult(items, { page: query.page, size: query.size, totalCount: list.length }),
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
