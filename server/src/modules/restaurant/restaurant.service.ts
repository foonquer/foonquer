import { AppError } from '../../common/errors/app-error';
import { distanceMeters } from '../../common/geo';
import { type CurrentSeason, findCurrentSeason } from '../../common/season';
import { toKstIso, toKstIsoOrNull } from '../../common/time';
import { prisma } from '../../lib/prisma';
import { loadTasteWeights } from '../user/taste-weights';
import { businessStatusOf, parseBusinessHours } from './business-hours';
import { loadMyStates, myStateOf } from './my-state';
import { RestaurantError } from './restaurant.errors';
import type { RestaurantLocationQuery } from './restaurant.schema';
import { REVISIT_INTENT_MIN_SCORE } from './restaurant-stat-calc';
import { detailStatsOf, myOverallOf, ratingOf } from './restaurant-stats';

/** 종합 별점이 이 값 이상이면 "다시 갈 의향"으로 본다 (별점 기준) */

/** 숨김(H) 가게는 없는 것처럼 404. 폐업(C)은 기록 확인을 위해 보여 준다 */
async function findVisibleRestaurant(restaurantId: bigint) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: {
      category: { select: { name: true } },
      region: { select: { name: true } },
      sigungu: { select: { name: true } },
      restaurantStat: true,
    },
  });
  if (!restaurant || restaurant.status === 'H') {
    throw new AppError(RestaurantError.RESTAURANT_NOT_FOUND);
  }
  return restaurant;
}

/** 이번 시즌에 이 가게를 정복한 사람 수 (진행 중 시즌이 없으면 0) */
function currentSeasonConquerorCount(restaurantId: bigint, season: CurrentSeason | null) {
  if (!season) return Promise.resolve(0);
  return prisma.conquest.count({ where: { restaurantId, seasonId: season.id } });
}

/** 정복을 만든 방문에 연결된 내 리뷰 (삭제한 리뷰는 없는 것으로 본다) */
async function conquestReview(visitId: bigint) {
  const review = await prisma.review.findUnique({
    where: { visitId },
    select: { id: true, overallScore: true, content: true, status: true },
  });
  return review && review.status !== 'D' ? review : null;
}

/** 가게 정보, 내 정복 상태, 이번 시즌 정복자 수를 같이 읽는다 */
async function loadContext(userId: bigint, restaurantId: bigint) {
  const restaurant = await findVisibleRestaurant(restaurantId);
  const season = await findCurrentSeason();
  const [states, conquerorCount, weights] = await Promise.all([
    loadMyStates(userId, [restaurant.id], season),
    currentSeasonConquerorCount(restaurant.id, season),
    loadTasteWeights(userId),
  ]);
  const state = myStateOf(states, restaurant.id);
  const review =
    state.conquestState === 'CONQUERED' && state.currentConquest
      ? await conquestReview(state.currentConquest.visitId)
      : null;
  return { restaurant, state, conquerorCount, review, season, weights };
}

/**
 * MAP-02 "정복하면 8위 → 7위": 이번 시즌 그 가게를 아직 정복하지 않았을 때만.
 * 정복하면 내 정복 수 +1, 순위는 정복 수가 그 이상인 다른 탐험가 수 + 1 (동점이면 먼저 도달한 사람이 위)
 */
async function rankPreviewOf(
  userId: bigint,
  restaurant: { sigunguId: number; sigungu: { name: string } },
  season: CurrentSeason | null,
) {
  if (!season) return null;
  const mine = await prisma.seasonRegionStat.findUnique({
    where: {
      seasonId_sigunguId_userId: { seasonId: season.id, sigunguId: restaurant.sigunguId, userId },
    },
    select: { conquestCount: true, rankNo: true },
  });
  const after = (mine?.conquestCount ?? 0) + 1;
  const ahead = await prisma.seasonRegionStat.count({
    where: {
      seasonId: season.id,
      sigunguId: restaurant.sigunguId,
      userId: { not: userId },
      conquestCount: { gte: after },
    },
  });
  return {
    sigunguId: restaurant.sigunguId,
    sigunguName: restaurant.sigungu.name,
    conquestCount: mine?.conquestCount ?? 0,
    conquestCountAfter: after,
    currentRank: mine?.rankNo ?? null,
    rankAfterConquest: ahead + 1,
  };
}

/** MAP-02 가게 미리보기 */
export async function getRestaurantPreview(
  userId: bigint,
  restaurantId: bigint,
  from: RestaurantLocationQuery,
  now = new Date(),
) {
  const {
    restaurant: r,
    state,
    conquerorCount,
    review,
    season,
    weights,
  } = await loadContext(userId, restaurantId);
  const conquest = state.conquestState === 'CONQUERED' ? state.currentConquest : null;
  const moving = state.conquestState === 'MOVING' ? state.movingVisit : null;
  const rankPreview = state.currentConquest ? null : await rankPreviewOf(userId, r, season);

  return {
    restaurantId: r.id,
    name: r.name,
    categoryId: r.categoryId,
    categoryName: r.category?.name ?? null,
    sigunguName: r.sigungu.name,
    dongName: r.region.name,
    distanceM: distanceMeters(from, { lat: r.lat.toNumber(), lng: r.lng.toNumber() }),
    rating: ratingOf(r.restaurantStat),
    myOverallScore: myOverallOf(r.restaurantStat, weights).score,
    hasMapae: r.hasMapae,
    businessStatus: businessStatusOf(parseBusinessHours(r.businessHours), now),
    currentSeasonConquerorCount: conquerorCount,
    conquestState: state.conquestState,
    conqueredInPastSeason: state.conqueredInPastSeason,
    isSaved: state.isSaved,
    myConquest: conquest
      ? {
          conqueredAt: toKstIso(conquest.conqueredAt),
          myScore: review ? review.overallScore.toNumber() : null,
          // 재방문 의사 칸은 없어지고 맛 별점에 포함됐다 (3.0 이상이면 다시 먹을 의향)
          revisitIntent: review ? review.overallScore.toNumber() >= REVISIT_INTENT_MIN_SCORE : null,
          hasTextReview: !!review?.content,
          reviewId: review?.id ?? null,
        }
      : null,
    moving: moving ? { visitId: moving.id, verifiedAt: toKstIsoOrNull(moving.verifiedAt) } : null,
    rankPreview,
  };
}

/** REST-01 음식점 상세 조회 */
export async function getRestaurantDetail(
  userId: bigint,
  restaurantId: bigint,
  from: RestaurantLocationQuery,
  now = new Date(),
) {
  const {
    restaurant: r,
    state,
    conquerorCount,
    review,
    weights,
  } = await loadContext(userId, restaurantId);
  const conquest = state.conquestState === 'CONQUERED' ? state.currentConquest : null;
  const businessHours = parseBusinessHours(r.businessHours);

  return {
    restaurantId: r.id,
    kakaoPlaceId: r.kakaoPlaceId,
    name: r.name,
    status: r.status,
    categoryId: r.categoryId,
    categoryName: r.category?.name ?? null,
    kakaoCategoryName: r.kakaoCategoryName,
    phone: r.phone,
    roadAddress: r.roadAddress,
    jibunAddress: r.jibunAddress,
    sigunguName: r.sigungu.name,
    dongName: r.region.name,
    lat: r.lat.toNumber(),
    lng: r.lng.toNumber(),
    distanceM: distanceMeters(from, { lat: r.lat.toNumber(), lng: r.lng.toNumber() }),
    kakaoPlaceUrl: `https://place.map.kakao.com/${r.kakaoPlaceId}`,
    businessHours,
    businessStatus: businessStatusOf(businessHours, now),
    rating: ratingOf(r.restaurantStat),
    // 항목별 평균의 맛 자리에 보이는 "내 종합" + 계산 보기 시트 (피그마 3-2)
    myOverall: myOverallOf(r.restaurantStat, weights),
    hasMapae: r.hasMapae,
    stats: { ...detailStatsOf(r.restaurantStat), currentSeasonConquerorCount: conquerorCount },
    my: {
      conquestState: state.conquestState,
      conqueredInPastSeason: state.conqueredInPastSeason,
      conqueredAt: conquest ? toKstIso(conquest.conqueredAt) : null,
      myScore: conquest && review ? review.overallScore.toNumber() : null,
      myReviewId: conquest && review ? review.id : null,
      movingVisitId: state.conquestState === 'MOVING' ? (state.movingVisit?.id ?? null) : null,
      isSaved: state.isSaved,
    },
  };
}
