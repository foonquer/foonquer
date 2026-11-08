import { distanceMeters } from '../../common/geo';
import { prisma } from '../../lib/prisma';
import { type MyRestaurantState } from './my-state';
import type { TasteWeights } from '../user/taste-weights';
import { localVisitRateOf, myOverallOf, ratingOf, revisitRateOf } from './restaurant-stats';

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
  weights: TasteWeights,
) {
  return {
    restaurantId: row.id,
    name: row.name,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    /** 업종 소분류 (공공데이터, 예: 해장국·냉면) — 같은 한식끼리도 구분되게 카드에 같이 보인다 */
    categoryDetail: row.categoryDetail,
    distanceM: distanceMeters(from, { lat: row.lat.toNumber(), lng: row.lng.toNumber() }),
    rating: ratingOf(row.restaurantStat),
    // "★ 4.6 맛 · 내 종합 4.4" (피그마 3-2)
    myOverallScore: myOverallOf(row.restaurantStat, weights).score,
    hasMapae: row.hasMapae,
    revisitRate: revisitRateOf(row.restaurantStat),
    localVisitRate: localVisitRateOf(row.restaurantStat),
    conquestState: state.conquestState,
  };
}

/** LIKE 검색어의 %, _ 를 글자 그대로 찾도록 바꾼다 (ESCAPE '!'와 같이 쓴다) */
export function likeContains(keyword: string) {
  return `%${keyword.replace(/[!%_]/g, (c) => `!${c}`)}%`;
}
