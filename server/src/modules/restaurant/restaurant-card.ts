import { distanceMeters } from '../../common/geo';
import { prisma } from '../../lib/prisma';
import { type MyRestaurantState } from './my-state';
import { localVisitRateOf, ratingOf, revisitRateOf } from './restaurant-stats';

/** 목록 카드에 쓰는 가게 정보를 id 순서대로 읽는다 (SQL로 정렬·페이지를 정한 뒤 부른다) */
export async function loadRestaurantsInOrder(ids: bigint[]) {
  if (ids.length === 0) return [];
  const rows = await prisma.restaurant.findMany({
    where: { id: { in: ids } },
    include: { category: { select: { name: true } }, restaurantStat: true },
  });
  const byId = new Map(rows.map((r) => [r.id.toString(), r]));
  return ids.flatMap((id) => byId.get(id.toString()) ?? []);
}

type CardRow = Awaited<ReturnType<typeof loadRestaurantsInOrder>>[number];

/** SEARCH-02·RECO-01 items[] 공통 필드 */
export function toRestaurantCard(
  row: CardRow,
  state: MyRestaurantState,
  from: { lat?: number; lng?: number },
) {
  return {
    restaurantId: row.id,
    name: row.name,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    distanceM: distanceMeters(from, { lat: row.lat.toNumber(), lng: row.lng.toNumber() }),
    rating: ratingOf(row.restaurantStat),
    revisitRate: revisitRateOf(row.restaurantStat),
    localVisitRate: localVisitRateOf(row.restaurantStat),
    conquestState: state.conquestState,
  };
}

/** LIKE 검색어의 %, _ 를 글자 그대로 찾도록 바꾼다 (ESCAPE '!'와 같이 쓴다) */
export function likeContains(keyword: string) {
  return `%${keyword.replace(/[!%_]/g, (c) => `!${c}`)}%`;
}
