import type { Prisma } from '../../generated/prisma/client';
import { publicImageUrl } from '../../lib/image-url';
import {
  TASTE_KEYS,
  type TasteKey,
  type TasteWeights,
  weightPercents,
} from '../user/taste-weights';

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

/** 가게 대표 사진 URL (인증 리뷰 사진). 없으면 null → 화면은 음식 종류 그림 */
export function coverImageUrlOf(stat: Stat) {
  return publicImageUrl(stat?.coverImageKey);
}

/** 재방문 % = revisitor_count ÷ visitor_count */
export function revisitRateOf(stat: Stat) {
  return stat ? percent(stat.revisitorCount, stat.visitorCount) : null;
}

/** 현지인 방문 % = local_visit_count ÷ visit_count */
export function localVisitRateOf(stat: Stat) {
  return stat ? percent(stat.localVisitCount, stat.visitCount) : null;
}

/**
 * REST-01 stats. 세부 별점 4항목(청결·양·서비스·가격)은 detail_review_count가 분모(네 항목을 모두 남기거나 모두 비운다),
 * 재방문 의사 %는 맛 별점 3.0 이상 리뷰 수(revisit_intent_count) ÷ review_count (ERD v1.4)
 */
export function detailStatsOf(stat: Stat) {
  const detail = stat?.detailReviewCount ?? 0;
  return {
    cleanliness: stat ? average(stat.cleanlinessSum, detail) : null,
    portion: stat ? average(stat.portionSum, detail) : null,
    service: stat ? average(stat.serviceSum, detail) : null,
    price: stat ? average(stat.priceSum, detail) : null,
    revisitIntentRate: stat ? percent(stat.revisitIntentCount, stat.reviewCount) : null,
    /** 리뷰 "재방문 의사 있음" 필터 칩의 수 */
    revisitIntentCount: stat?.revisitIntentCount ?? 0,
    localVisitRate: localVisitRateOf(stat),
    revisitRate: revisitRateOf(stat),
    textReviewCount: stat?.textReviewCount ?? 0,
    photoReviewCount: stat?.photoReviewCount ?? 0,
    visitCount: stat?.visitCount ?? 0,
  };
}

/**
 * 내 종합 별점 (ERD v1.4, 피그마 3-2): 항목 평균 × 내 취향 비중. 맛 평균은 맛 별점(rating.score)을 쓴다.
 * 세부 별점이 없는 항목은 빼고 남은 항목끼리 비중을 다시 나눈다. 맛 별점이 없으면 null.
 * 예) 맛 4.4·청결 4.3·양 4.4·서비스 4.5·가격 4.2, 비중 30·30·10·10·20% → 4.3
 */
export function myOverallOf(stat: Stat, weights: TasteWeights) {
  const taste = ratingOf(stat).score;
  const d = detailStatsOf(stat);
  const averages: Record<TasteKey, number | null> = {
    taste,
    cleanliness: d.cleanliness,
    portion: d.portion,
    service: d.service,
    price: d.price,
  };
  const used = TASTE_KEYS.filter((k) => averages[k] !== null);
  const percents = taste === null ? {} : weightPercents(weights, used);
  const total = used.reduce((sum, k) => sum + weights[k], 0);
  const weighted = used.reduce((sum, k) => sum + (averages[k] ?? 0) * weights[k], 0);
  const score = taste === null ? null : Math.round((weighted / total) * 10) / 10;
  return {
    score,
    items: TASTE_KEYS.map((key) => ({
      key,
      average: averages[key],
      weightPercent: percents[key] ?? null,
    })),
  };
}
