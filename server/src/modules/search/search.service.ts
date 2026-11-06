import { AppError } from '../../common/errors/app-error';
import { toPageResult } from '../../common/pagination';
import { findCurrentSeason } from '../../common/season';
import { TtlCache } from '../../common/ttl-cache';
import { Prisma } from '../../generated/prisma/client';
import { KakaoApiError, searchPlacesByKeyword } from '../../lib/kakao-local';
import { prisma } from '../../lib/prisma';
import { RegionError } from '../region/region.errors';
import { type RegionNode, requireSeoulArea, requireSeoulDong } from '../region/region.service';
import { bboxOfRegionCode } from '../region/seoul-regions';
import { requireCategory } from '../restaurant/category';
import { saveKakaoPlaces } from '../restaurant/kakao-place-sync';
import { loadMyStates, myStateOf } from '../restaurant/my-state';
import {
  likeContains,
  loadRestaurantsInOrder,
  toRestaurantCard,
} from '../restaurant/restaurant-card';
import { RestaurantError, SEARCH_KEYWORD_TOO_LONG } from '../restaurant/restaurant.errors';
import type { RecommendationQuery, RestaurantSearchQuery } from './search.schema';
import { similarKeywordsOf } from './similar-keywords';

const MAX_KEYWORD_LENGTH = 30;
/** 재방문 % 순서를 믿을 수 있는 최소 방문자 수 (SEARCH-02 REVISIT 정렬, RECO-01 REVISIT 대상) */
const MIN_VISITORS_FOR_REVISIT = 5;
/** RECO-01 RATING 대상: 인증 평가 5개 이상 */
const MIN_REVIEWS_FOR_RATING = 5;

/** regionId가 없으면 내 동네 0번 동 */
async function regionIdOrMyFirst(userId: bigint, regionId: number | undefined) {
  if (regionId !== undefined) return regionId;
  const first = await prisma.memberLocalRegion.findFirst({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
    select: { regionId: true },
  });
  if (!first) throw new AppError(RegionError.REGION_NOT_FOUND);
  return first.regionId;
}

function regionBody(dong: RegionNode, sigungu: RegionNode) {
  return {
    regionId: dong.id,
    dongName: dong.name,
    sigunguId: sigungu.id,
    sigunguName: sigungu.name,
  };
}

/** SEARCH-01 검색 홈: 동 이름과 카테고리 12개별 영업 중 가게 수 */
export async function getSearchHome(userId: bigint, regionId: number | undefined) {
  const { dong, sigungu } = await requireSeoulDong(await regionIdOrMyFirst(userId, regionId));
  const [categories, counts] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    prisma.restaurant.groupBy({
      by: ['categoryId'],
      where: { regionId: dong.id, status: 'A' },
      _count: { _all: true },
    }),
  ]);
  const countByCategory = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  return {
    region: regionBody(dong, sigungu),
    categories: categories.map((c) => ({
      categoryId: c.id,
      name: c.name,
      restaurantCount: countByCategory.get(c.id) ?? 0,
    })),
  };
}

// 같은 (검색어, 범위)는 24시간 동안 카카오를 다시 부르지 않고 지난번에 찾은 장소 id를 쓴다.
const KAKAO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const keywordResults = new TtlCache<string[]>(KAKAO_CACHE_TTL_MS);

/** 카카오 키워드 검색(범위 사각형 안 음식점·카페) → 없는 가게는 DB에 저장하고 찾은 장소 id를 돌려준다 */
async function kakaoKeywordPlaceIds(keyword: string, area: RegionNode) {
  const key = `${keyword.toLowerCase()}|${area.code}`;
  const cached = keywordResults.get(key);
  if (cached) return cached;

  const bbox = bboxOfRegionCode(area.code);
  if (!bbox) return [];
  let places;
  try {
    places = await searchPlacesByKeyword(keyword, bbox);
  } catch (err) {
    if (!(err instanceof KakaoApiError)) throw err;
    console.error('카카오 키워드 검색 실패 (SEARCH-02)', err);
    return [];
  }
  await saveKakaoPlaces(places);
  const ids = [...new Set(places.map((p) => p.id))];
  keywordResults.set(key, ids);
  return ids;
}

/** 가게마다 검색어가 들어간 영수증 메뉴 중 가장 많이 나온 것 */
async function topMatchedMenus(restaurantIds: bigint[], like: string) {
  const menus = new Map<string, string>();
  if (restaurantIds.length === 0) return menus;
  const rows = await prisma.$queryRaw<{ restaurantId: bigint; menuName: string; cnt: bigint }[]>`
    SELECT v.restaurant_id AS restaurantId, i.menu_name AS menuName, COUNT(*) AS cnt
    FROM visit_receipt_item i JOIN visit v ON v.id = i.visit_id
    WHERE v.restaurant_id IN (${Prisma.join(restaurantIds)})
      AND v.status IN ('V', 'C')
      AND i.menu_name LIKE ${like} ESCAPE '!'
    GROUP BY v.restaurant_id, i.menu_name`;
  const best = new Map<string, { menuName: string; cnt: number }>();
  for (const row of rows) {
    const key = row.restaurantId.toString();
    const cnt = Number(row.cnt);
    const prev = best.get(key);
    if (
      !prev ||
      cnt > prev.cnt ||
      (cnt === prev.cnt && row.menuName.localeCompare(prev.menuName, 'ko') < 0)
    ) {
      best.set(key, { menuName: row.menuName, cnt });
    }
  }
  for (const [key, { menuName }] of best) menus.set(key, menuName);
  return menus;
}

/**
 * SEARCH-02 맛집 검색.
 * keyword는 ① 카카오 키워드 검색 결과 ② 가게 이름 ③ 영수증 메뉴(인증 완료 방문)에서 찾아 합치고(중복 없음),
 * categoryId만 오면 그 카테고리 가게 전체. 둘 다 오면 둘 다 만족하는 가게만.
 */
export async function searchRestaurants(userId: bigint, q: RestaurantSearchQuery) {
  const { keyword } = q;
  if (keyword && [...keyword].length > MAX_KEYWORD_LENGTH) {
    throw new AppError(SEARCH_KEYWORD_TOO_LONG);
  }
  if (!keyword && q.categoryId === undefined) {
    throw new AppError(RestaurantError.SEARCH_CONDITION_REQUIRED);
  }
  const category = q.categoryId !== undefined ? await requireCategory(q.categoryId) : null;
  if (q.sort === 'DISTANCE' && (q.lat === undefined || q.lng === undefined)) {
    throw new AppError(RestaurantError.LOCATION_REQUIRED);
  }
  const { dong, sigungu } = await requireSeoulDong(await regionIdOrMyFirst(userId, q.regionId));
  const area = q.scope === 'DONG' ? dong : sigungu;

  const kakaoIds = keyword ? await kakaoKeywordPlaceIds(keyword, area) : [];
  const like = keyword ? likeContains(keyword) : '';

  const where = Prisma.sql`
    r.status = 'A'
    AND ${q.scope === 'DONG' ? Prisma.sql`r.region_id = ${dong.id}` : Prisma.sql`r.sigungu_id = ${sigungu.id}`}
    ${category ? Prisma.sql`AND r.category_id = ${category.id}` : Prisma.empty}
    ${
      keyword
        ? Prisma.sql`AND (
            r.name LIKE ${like} ESCAPE '!'
            OR r.id IN (
              SELECT v.restaurant_id FROM visit v JOIN visit_receipt_item i ON i.visit_id = v.id
              WHERE v.status IN ('V', 'C') AND i.menu_name LIKE ${like} ESCAPE '!')
            ${kakaoIds.length > 0 ? Prisma.sql`OR r.kakao_place_id IN (${Prisma.join(kakaoIds)})` : Prisma.empty}
          )`
        : Prisma.empty
    }`;

  const orderBy =
    q.sort === 'DISTANCE'
      ? Prisma.sql`ST_Distance_Sphere(POINT(r.lng, r.lat), POINT(${q.lng}, ${q.lat})), r.id`
      : q.sort === 'REVISIT'
        ? Prisma.sql`(COALESCE(s.visitor_count, 0) >= ${MIN_VISITORS_FOR_REVISIT}) DESC,
            s.revisitor_count / NULLIF(s.visitor_count, 0) DESC,
            COALESCE(s.visitor_count, 0) DESC, r.id`
        : Prisma.sql`COALESCE(s.local_visit_count, 0) DESC, COALESCE(s.review_count, 0) DESC, r.id`;

  const [countRows, idRows] = await Promise.all([
    prisma.$queryRaw<{ cnt: bigint }[]>`SELECT COUNT(*) AS cnt FROM restaurant r WHERE ${where}`,
    prisma.$queryRaw<{ id: bigint }[]>`
      SELECT r.id FROM restaurant r LEFT JOIN restaurant_stat s ON s.restaurant_id = r.id
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}`,
  ]);
  const totalCount = Number(countRows[0]?.cnt ?? 0);
  const ids = idRows.map((r) => BigInt(r.id));

  const season = await findCurrentSeason();
  const [rows, states, menus] = await Promise.all([
    loadRestaurantsInOrder(ids),
    loadMyStates(userId, ids, season),
    keyword ? topMatchedMenus(ids, like) : Promise.resolve(new Map<string, string>()),
  ]);

  const lowerKeyword = keyword?.toLowerCase();
  const items = rows.map((r) => {
    // 이름에 검색어가 있으면 NAME, 아니면 영수증 메뉴로 찾은 것은 MENU, 카카오 검색으로만 찾은 것은 NAME
    const menuName = menus.get(r.id.toString()) ?? null;
    const byName = !!lowerKeyword && r.name.toLowerCase().includes(lowerKeyword);
    const matchedBy = !keyword ? null : !byName && menuName ? 'MENU' : 'NAME';
    return {
      ...toRestaurantCard(r, myStateOf(states, r.id), q),
      matchedBy,
      matchedMenuName: matchedBy === 'MENU' ? menuName : null,
    };
  });

  const page = toPageResult(items, { page: q.page, size: q.size, totalCount });
  return {
    message:
      totalCount > 0
        ? '검색 결과를 조회했어요.'
        : `'${keyword ?? category?.name ?? ''}' 맛집을 찾지 못했어요.`,
    data: {
      keyword: keyword ?? null,
      region: regionBody(dong, sigungu),
      scope: q.scope,
      sort: q.sort,
      ...page,
      emptyGuide:
        totalCount === 0
          ? {
              canSearchSigungu: q.scope === 'DONG',
              similarKeywords: keyword ? similarKeywordsOf(keyword) : [],
            }
          : null,
    },
  };
}

/** RECO-01 추천 맛집 목록 (카카오는 부르지 않는다: 통계가 있는 가게는 이미 DB에 있다) */
export async function getRecommendations(userId: bigint, q: RecommendationQuery) {
  const category = q.categoryId !== undefined ? await requireCategory(q.categoryId) : null;
  const area = await requireSeoulArea(
    await regionIdOrMyFirst(userId, q.regionId),
    '지금은 서울만 볼 수 있어요.',
  );

  const condition =
    q.type === 'REVISIT'
      ? Prisma.sql`s.visitor_count >= ${MIN_VISITORS_FOR_REVISIT}`
      : q.type === 'RATING'
        ? Prisma.sql`s.review_count >= ${MIN_REVIEWS_FOR_RATING} AND s.weight_sum > 0`
        : Prisma.sql`s.local_visit_count >= 1`;
  const orderBy =
    q.type === 'REVISIT'
      ? Prisma.sql`s.revisitor_count / s.visitor_count DESC, s.visitor_count DESC, r.id`
      : q.type === 'RATING'
        ? Prisma.sql`s.weighted_score_sum / s.weight_sum DESC, s.review_count DESC, r.id`
        : Prisma.sql`s.local_visit_count DESC, s.review_count DESC, r.id`;
  const where = Prisma.sql`
    r.status = 'A'
    AND ${area.level === 3 ? Prisma.sql`r.region_id = ${area.dong.id}` : Prisma.sql`r.sigungu_id = ${area.sigungu.id}`}
    ${category ? Prisma.sql`AND r.category_id = ${category.id}` : Prisma.empty}
    AND ${condition}`;

  const [countRows, idRows] = await Promise.all([
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*) AS cnt FROM restaurant r JOIN restaurant_stat s ON s.restaurant_id = r.id
      WHERE ${where}`,
    prisma.$queryRaw<{ id: bigint }[]>`
      SELECT r.id FROM restaurant r JOIN restaurant_stat s ON s.restaurant_id = r.id
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}`,
  ]);
  const totalCount = Number(countRows[0]?.cnt ?? 0);
  const ids = idRows.map((r) => BigInt(r.id));

  const season = await findCurrentSeason();
  const [rows, states] = await Promise.all([
    loadRestaurantsInOrder(ids),
    loadMyStates(userId, ids, season),
  ]);
  const offset = (q.page - 1) * q.size;
  const items = rows.map((r, index) => {
    const { conquestState, ...card } = toRestaurantCard(r, myStateOf(states, r.id), q);
    return {
      rank: offset + index + 1,
      ...card,
      visitorCount: r.restaurantStat?.visitorCount ?? 0,
      conquestState,
    };
  });

  return {
    type: q.type,
    region: {
      regionId: area.level === 3 ? area.dong.id : area.sigungu.id,
      level: area.level,
      dongName: area.dong?.name ?? null,
      sigunguId: area.sigungu.id,
      sigunguName: area.sigungu.name,
    },
    ...toPageResult(items, { page: q.page, size: q.size, totalCount }),
  };
}
