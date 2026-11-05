import type { Prisma } from '../../generated/prisma/client';

// 명세서 "값 규칙": 별점은 소수점 1자리(리뷰가 없으면 null), 비율(...Rate)은 0~100 정수(분모가 0이면 null).
// restaurant_stat 행이 아직 없는 가게(방문·리뷰 0)는 null을 넘기면 된다.

type Stat = Prisma.RestaurantStatGetPayload<object> | null | undefined;

/** 소수점 1자리 평균 (분모가 0이면 null) */
function average(sum: number, count: number) {
  if (count <= 0) return null;
  return Math.round((sum * 10) / count) / 10;
}

/** 0~100 정수 % (분모가 0이면 null) */
function percent(part: number, whole: number) {
  if (whole <= 0) return null;
  return Math.round((part * 100) / whole);
}

/**
 * rating { score: 신뢰도 가중 별점 R, reviewCount }.
 * R = (C × m + Σ(w × r)) / (C + Σw)은 리뷰 쪽이 restaurant_stat.display_score에 계산해 둔다(ERD v1.0).
 * 리뷰가 없거나 아직 계산 전이면 null → 화면에 "아직 별점이 없어요"
 */
export function ratingOf(stat: Stat) {
  if (!stat || stat.reviewCount <= 0 || stat.displayScore === null) {
    return { score: null, reviewCount: stat?.reviewCount ?? 0 };
  }
  return { score: stat.displayScore.toNumber(), reviewCount: stat.reviewCount };
}

/** 재방문 % = revisitor_count ÷ visitor_count */
export function revisitRateOf(stat: Stat) {
  return stat ? percent(stat.revisitorCount, stat.visitorCount) : null;
}

/** 현지인 방문 % = local_visit_count ÷ visit_count */
export function localVisitRateOf(stat: Stat) {
  return stat ? percent(stat.localVisitCount, stat.visitCount) : null;
}

/** REST-01 stats. 맛은 review_count, 나머지 항목과 재방문 의사는 detail_review_count가 분모 */
export function detailStatsOf(stat: Stat) {
  const detail = stat?.detailReviewCount ?? 0;
  return {
    taste: stat ? average(stat.tasteSum, stat.reviewCount) : null,
    cleanliness: stat ? average(stat.cleanlinessSum, detail) : null,
    portion: stat ? average(stat.portionSum, detail) : null,
    service: stat ? average(stat.serviceSum, detail) : null,
    price: stat ? average(stat.priceSum, detail) : null,
    revisitIntentRate: stat ? percent(stat.revisitIntentCount, detail) : null,
    localVisitRate: localVisitRateOf(stat),
    revisitRate: revisitRateOf(stat),
    textReviewCount: stat?.textReviewCount ?? 0,
    photoReviewCount: stat?.photoReviewCount ?? 0,
    visitCount: stat?.visitCount ?? 0,
  };
}
