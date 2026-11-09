import { findCurrentSeason } from '../../common/season';
import { Prisma } from '../../generated/prisma/client';
import { KakaoApiError, type KakaoNearPlace, nearbyFoodPlaces } from '../../lib/kakao-local';
import { prisma } from '../../lib/prisma';
import { type BBox, SEOUL } from '../region/seoul-regions';
import { requireCategory } from '../restaurant/category';
import { saveKakaoPlaceId } from '../restaurant/kakao-link';
import { loadMyStates, myStateOf } from '../restaurant/my-state';
import { normalizeStoreName, storeNameMatches } from '../visit/visit.service';
import type { MapRestaurantsQuery, NearbyPlacesQuery } from './map.schema';

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

/** 카카오 장소와 같은 가게로 볼 우리 가게의 최대 거리(m). 음식점 상세(kakao-link)와 같은 기준 */
const SAME_STORE_RADIUS_M = 100;
/**
 * 이름을 맞춰 볼 100m 안 가게 수 상한. 가까운 곳이 모두 다른 이름이어도 맞는 가게를 놓치지 않게 넉넉히 둔다
 * (서울에서 가게가 가장 빽빽한 구도 100m 안은 수백 곳 아래)
 */
const SAME_STORE_MAX_CANDIDATES = 1000;

/** 영업 중(A)인 우리 가게 중 (lat, lng)에서 radiusM 안, 가까운 순. 위경도 사각형으로 먼저 좁힌다 */
function nearbyRestaurants(
  lat: number,
  lng: number,
  radiusM: number,
  extra: Prisma.Sql,
  limit: number,
) {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const distance = Prisma.sql`ST_Distance_Sphere(POINT(r.lng, r.lat), POINT(${lng}, ${lat}))`;
  return prisma.$queryRaw<{ id: bigint; name: string }[]>`
    SELECT r.id, r.name FROM restaurant r
    WHERE r.status = 'A'
      AND r.lat BETWEEN ${lat - dLat} AND ${lat + dLat}
      AND r.lng BETWEEN ${lng - dLng} AND ${lng + dLng}
      AND ${distance} <= ${radiusM}
      ${extra}
    ORDER BY ${distance}, r.id
    LIMIT ${limit}`;
}

/** 카카오 장소 → 우리 가게. 장소 ID로 이어진 가게, 없으면 100m 안 이름이 맞는 가장 가까운 가게(이때 장소 ID 저장) */
async function restaurantForPlace(place: KakaoNearPlace): Promise<bigint | null> {
  const linked = await prisma.restaurant.findFirst({
    where: { kakaoPlaceId: place.id, status: 'A' },
    select: { id: true },
  });
  if (linked) return linked.id;

  const near = await nearbyRestaurants(
    Number(place.y),
    Number(place.x),
    SAME_STORE_RADIUS_M,
    Prisma.sql`AND r.kakao_place_id IS NULL`,
    SAME_STORE_MAX_CANDIDATES,
  );
  // 이름이 똑같은 가게가 있으면 그 중 가장 가까운 곳. 한쪽이 다른 쪽을 포함하는 이름(옛날손칼국수 ↔ 옛날손칼국수 가양점)만
  // 맞으면 그런 가게가 딱 한 곳일 때만 잇는다 (둘 이상이면 어느 가게인지 알 수 없어 장소 ID를 잘못 저장할 수 있다)
  const key = normalizeStoreName(place.place_name);
  const matches = near.filter((r) => storeNameMatches(place.place_name, r.name));
  const match =
    matches.find((r) => normalizeStoreName(r.name) === key) ??
    (matches.length === 1 ? matches[0] : undefined);
  if (!match) return null;
  const id = BigInt(match.id);
  await saveKakaoPlaceId(id, place.id);
  return id;
}

/** MAP-03 후보 수 */
export const MAX_NEARBY_PLACES = 5;

/**
 * MAP-03 누른 자리 근처 음식점 (가까운 순 5곳). 웹은 이 중에서 고르게 한다.
 * 카카오 지도에 그려진 가게 이름은 카카오 장소 좌표에 있어서, 누른 곳 근처 카카오 음식점·카페를
 * 실시간으로 찾아 우리 가게와 잇는다 (카카오 이용 정책상 장소 ID만 저장하고 이름·좌표는 응답에만 쓴다).
 * - 카카오 가게가 우리 가게가 아니면 restaurantId null (이름은 카카오 이름)
 * - 카카오가 실패하거나 근처에 아무것도 없으면 우리 가게 중 radiusM 안 가까운 곳
 */
export async function findNearbyPlaces(q: NearbyPlacesQuery) {
  const [swLat, swLng, neLat, neLng] = SEOUL.bbox;
  if (q.lat < swLat || q.lat > neLat || q.lng < swLng || q.lng > neLng) return { items: [] };

  let places: KakaoNearPlace[] = [];
  try {
    places = await nearbyFoodPlaces(q.lat, q.lng, q.radiusM, MAX_NEARBY_PLACES);
  } catch (err) {
    if (!(err instanceof KakaoApiError)) throw err;
    console.error('카카오 근처 음식점 찾기 실패', err);
  }

  const found: { name: string; restaurantId: bigint | null }[] = [];
  if (places.length > 0) {
    // 하나씩 차례로 잇는다: 앞 장소가 저장한 장소 ID 덕분에 같은 우리 가게를 두 장소에 잇지 않는다
    for (const place of places) {
      found.push({ name: place.place_name, restaurantId: await restaurantForPlace(place) });
    }
  } else {
    const rows = await nearbyRestaurants(q.lat, q.lng, q.radiusM, Prisma.empty, MAX_NEARBY_PLACES);
    for (const r of rows) found.push({ name: r.name, restaurantId: BigInt(r.id) });
  }

  const ids = found.flatMap((f) => (f.restaurantId === null ? [] : [f.restaurantId]));
  const categories = await prisma.restaurant.findMany({
    where: { id: { in: ids } },
    select: { id: true, category: { select: { name: true } } },
  });
  const categoryOf = new Map(categories.map((r) => [r.id.toString(), r.category?.name ?? null]));
  return {
    items: found.map((f) => ({
      name: f.name,
      restaurantId: f.restaurantId,
      categoryName:
        f.restaurantId === null ? null : (categoryOf.get(f.restaurantId.toString()) ?? null),
    })),
  };
}
