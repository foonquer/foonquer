import { findCurrentSeason } from '../../common/season';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { type BBox, SEOUL } from '../region/seoul-regions';
import { requireCategory } from '../restaurant/category';
import { loadMyStates, myStateOf } from '../restaurant/my-state';
import type { MapRestaurantsQuery } from './map.schema';

/** 한 번에 돌려주는 최대 가게 수. 넘으면 truncated = true ("지도를 확대해 보세요") */
export const MAX_MAP_ITEMS = 300;

function intersects(a: BBox, b: BBox) {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

/** MAP-01 지도 영역 음식점 조회 */
export async function getMapRestaurants(userId: bigint, q: MapRestaurantsQuery) {
  if (q.categoryId !== undefined) await requireCategory(q.categoryId);
  const bounds: BBox = [q.swLat, q.swLng, q.neLat, q.neLng];

  // 서울 밖 영역은 에러가 아니라 빈 목록
  if (!intersects(bounds, SEOUL.bbox)) {
    return { items: [], totalCount: 0, truncated: false };
  }

  const season = await findCurrentSeason();

  // 내 정복 상태 필터 (loadMyStates와 같은 기준): 별점 대기 방문(visit.status = V)이 있으면
  // 이번 시즌에 정복했어도 MOVING이라 CONQUERED에서 빼고 NOT_CONQUERED에 넣는다.
  const conqueredNow = season
    ? Prisma.sql`EXISTS (
        SELECT 1 FROM conquest q
        WHERE q.restaurant_id = r.id AND q.user_id = ${userId} AND q.season_id = ${season.id})`
    : Prisma.sql`FALSE`;
  const moving = Prisma.sql`EXISTS (
    SELECT 1 FROM visit v
    WHERE v.restaurant_id = r.id AND v.user_id = ${userId} AND v.status = 'V')`;
  const conquestFilter =
    q.conquestState === 'CONQUERED'
      ? Prisma.sql`AND ${conqueredNow} AND NOT ${moving}`
      : q.conquestState === 'NOT_CONQUERED'
        ? Prisma.sql`AND (NOT ${conqueredNow} OR ${moving})`
        : Prisma.empty;
  const mineFilter = q.mineOnly
    ? Prisma.sql`AND (
        EXISTS (SELECT 1 FROM saved_restaurant s WHERE s.restaurant_id = r.id AND s.user_id = ${userId})
        OR EXISTS (SELECT 1 FROM conquest c WHERE c.restaurant_id = r.id AND c.user_id = ${userId})
        OR ${moving})`
    : Prisma.empty;

  const centerLat = (q.swLat + q.neLat) / 2;
  const centerLng = (q.swLng + q.neLng) / 2;
  const rows = await prisma.$queryRaw<{ id: bigint }[]>`
    SELECT r.id FROM restaurant r
    WHERE r.status = 'A'
      AND r.lat BETWEEN ${q.swLat} AND ${q.neLat}
      AND r.lng BETWEEN ${q.swLng} AND ${q.neLng}
      ${q.categoryId !== undefined ? Prisma.sql`AND r.category_id = ${q.categoryId}` : Prisma.empty}
      ${conquestFilter}
      ${mineFilter}
    ORDER BY ST_Distance_Sphere(POINT(r.lng, r.lat), POINT(${centerLng}, ${centerLat})), r.id
    LIMIT ${MAX_MAP_ITEMS + 1}`;

  const truncated = rows.length > MAX_MAP_ITEMS;
  const ids = rows.slice(0, MAX_MAP_ITEMS).map((r) => BigInt(r.id));
  const [restaurants, states] = await Promise.all([
    prisma.restaurant.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        categoryId: true,
        category: { select: { name: true } },
        lat: true,
        lng: true,
      },
    }),
    loadMyStates(userId, ids, season),
  ]);
  const byId = new Map(restaurants.map((r) => [r.id.toString(), r]));

  const items = ids.flatMap((id) => {
    const r = byId.get(id.toString());
    if (!r) return [];
    const state = myStateOf(states, r.id);
    return {
      restaurantId: r.id,
      name: r.name,
      categoryId: r.categoryId,
      categoryName: r.category?.name ?? null,
      lat: r.lat.toNumber(),
      lng: r.lng.toNumber(),
      conquestState: state.conquestState,
      conqueredInPastSeason: state.conqueredInPastSeason,
      isSaved: state.isSaved,
    };
  });
  return { items, totalCount: items.length, truncated };
}
