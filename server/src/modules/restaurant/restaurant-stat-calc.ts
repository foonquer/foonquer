import type { Db, Tx } from '../../common/db';

// 신뢰도 가중 별점 (「신뢰 온도 · 가중 별점 계산식」 2026-11-05, ERD v1.0 rating_param)
//   작성자 가중치  w_user = clamp(1 + (T − 50) / 50, 0.5, 1.5)
//   공감 가중치    s = (H − N) / (H + N), 확신도 c = min(1, (H + N) / k)
//                  w_help = 1 + HELP_POS × s × c (s ≥ 0) / 1 + HELP_NEG × s × c (s < 0)
//   리뷰 가중치    score_weight = clamp(w_user × w_help, TRUST_MIN, TRUST_MAX) × v (재방문 리뷰면 v = 1.1)
//   시간 감쇠      d = max(DECAY_MIN, DECAY_RATE ^ floor(지난 개월 / DECAY_MONTHS))
//   가게 별점      R = (C × m + Σ(w × r)) / (C + Σw), w = score_weight × d

/** 맛 별점 3.0 이상이면 다시 먹을 의향 (피그마 3-2 "3.0↑ 다시 먹을 의향 · 2.5↓ 재방문 의사 없음") */
export const REVISIT_INTENT_MIN_SCORE = 3;

export interface RatingParams {
  GLOBAL_MEAN: number;
  PRIOR_WEIGHT: number;
  TEMP_BASE: number;
  HELP_POS: number;
  HELP_NEG: number;
  HELP_FULL_COUNT: number;
  REVISIT_WEIGHT: number;
  DECAY_RATE: number;
  DECAY_MIN: number;
  DECAY_MONTHS: number;
  TRUST_MIN: number;
  TRUST_MAX: number;
}

/** rating_param 표에 행이 없을 때 쓰는 값 (seed와 같다) */
export const DEFAULT_RATING_PARAMS: RatingParams = {
  GLOBAL_MEAN: 3.8,
  PRIOR_WEIGHT: 5,
  TEMP_BASE: 50,
  HELP_POS: 0.5,
  HELP_NEG: 0.3,
  HELP_FULL_COUNT: 10,
  REVISIT_WEIGHT: 1.1,
  DECAY_RATE: 0.7,
  DECAY_MIN: 0.3,
  DECAY_MONTHS: 6,
  TRUST_MIN: 0.5,
  TRUST_MAX: 2.0,
};

export async function loadRatingParams(db: Db): Promise<RatingParams> {
  const rows = await db.ratingParam.findMany();
  const params = { ...DEFAULT_RATING_PARAMS };
  for (const row of rows) {
    if (row.code in params) params[row.code as keyof RatingParams] = row.value.toNumber();
  }
  return params;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/** 리뷰 가중치 score_weight (0.5~2.2, 소수 셋째 자리) */
export function scoreWeightOf(
  p: RatingParams,
  review: { trustTemp: number; visitorHelpful: number; unhelpful: number; isRevisit: boolean },
) {
  const wUser = clamp(1 + (review.trustTemp - p.TEMP_BASE) / p.TEMP_BASE, 0.5, 1.5);
  const total = review.visitorHelpful + review.unhelpful;
  let wHelp = 1;
  if (total > 0) {
    const s = (review.visitorHelpful - review.unhelpful) / total;
    const c = Math.min(1, total / p.HELP_FULL_COUNT);
    wHelp = 1 + (s >= 0 ? p.HELP_POS : p.HELP_NEG) * s * c;
  }
  const v = review.isRevisit ? p.REVISIT_WEIGHT : 1;
  return round(clamp(wUser * wHelp, p.TRUST_MIN, p.TRUST_MAX) * v, 3);
}

/** 시간 감쇠 d (리뷰를 쓴 지 DECAY_MONTHS개월마다 DECAY_RATE배, 최소 DECAY_MIN) */
export function decayOf(p: RatingParams, regDate: Date, now: Date) {
  const months = Math.max(0, (now.getTime() - regDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
  return Math.max(p.DECAY_MIN, p.DECAY_RATE ** Math.floor(months / p.DECAY_MONTHS));
}

/** 리뷰 한 개의 score_weight를 지금 작성자 온도·공감 수로 다시 정한다 */
export async function refreshReviewWeight(tx: Tx, reviewId: bigint, params?: RatingParams) {
  const p = params ?? (await loadRatingParams(tx));
  const review = await tx.review.findUniqueOrThrow({
    where: { id: reviewId },
    select: {
      visitorHelpfulCount: true,
      unhelpfulCount: true,
      isRevisit: true,
      user: { select: { trustTemp: true } },
    },
  });
  const scoreWeight = scoreWeightOf(p, {
    trustTemp: review.user.trustTemp.toNumber(),
    visitorHelpful: review.visitorHelpfulCount,
    unhelpful: review.unhelpfulCount,
    isRevisit: review.isRevisit,
  });
  await tx.review.update({ where: { id: reviewId }, data: { scoreWeight } });
  return scoreWeight;
}

/**
 * restaurant_stat을 리뷰·방문·정복·저장 기록에서 처음부터 다시 센다 (리뷰·반응·방문·저장이 바뀔 때마다, 하루 1번 배치).
 * 리뷰가 0개면 display_score = null. 가게별 좋았던/아쉬웠던 점 집계(restaurant_aspect_stat)도 같이 다시 센다.
 */
export async function refreshRestaurantStat(
  tx: Db,
  restaurantId: bigint,
  now = new Date(),
  params?: RatingParams,
) {
  const p = params ?? (await loadRatingParams(tx));
  const [reviews, visits, conquerors, saveCount] = await Promise.all([
    tx.review.findMany({
      where: { restaurantId, status: 'A' },
      select: {
        overallScore: true,
        cleanliness: true,
        portion: true,
        service: true,
        price: true,
        content: true,
        imageCount: true,
        scoreWeight: true,
        regDate: true,
      },
    }),
    tx.visit.findMany({
      where: { restaurantId, status: { in: ['V', 'C'] } },
      select: { userId: true, isLocal: true },
    }),
    tx.conquest.findMany({
      where: { restaurantId },
      distinct: ['userId'],
      select: { userId: true },
    }),
    tx.savedRestaurant.count({ where: { restaurantId } }),
  ]);

  let scoreSum = 0;
  let weightSum = 0;
  let weightedScoreSum = 0;
  let detailCount = 0;
  const detail = { cleanliness: 0, portion: 0, service: 0, price: 0 };
  let textCount = 0;
  let photoCount = 0;
  let revisitIntent = 0;
  for (const r of reviews) {
    const score = r.overallScore.toNumber();
    scoreSum += score;
    const w = r.scoreWeight.toNumber() * decayOf(p, r.regDate, now);
    weightSum += w;
    weightedScoreSum += w * score;
    if (score >= REVISIT_INTENT_MIN_SCORE) revisitIntent += 1;
    if (r.content) textCount += 1;
    if (r.imageCount > 0) photoCount += 1;
    if (r.cleanliness !== null) {
      detailCount += 1;
      detail.cleanliness += r.cleanliness;
      detail.portion += r.portion ?? 0;
      detail.service += r.service ?? 0;
      detail.price += r.price ?? 0;
    }
  }
  const displayScore =
    reviews.length > 0
      ? round((p.PRIOR_WEIGHT * p.GLOBAL_MEAN + weightedScoreSum) / (p.PRIOR_WEIGHT + weightSum), 1)
      : null;

  const visitsByUser = new Map<string, number>();
  for (const v of visits) {
    const key = v.userId.toString();
    visitsByUser.set(key, (visitsByUser.get(key) ?? 0) + 1);
  }

  const data = {
    reviewCount: reviews.length,
    textReviewCount: textCount,
    photoReviewCount: photoCount,
    scoreSum: round(scoreSum, 1),
    weightSum: round(weightSum, 3),
    weightedScoreSum: round(weightedScoreSum, 3),
    displayScore,
    displayScoreAt: now,
    cleanlinessSum: detail.cleanliness,
    portionSum: detail.portion,
    serviceSum: detail.service,
    priceSum: detail.price,
    detailReviewCount: detailCount,
    revisitIntentCount: revisitIntent,
    visitCount: visits.length,
    localVisitCount: visits.filter((v) => v.isLocal).length,
    visitorCount: visitsByUser.size,
    revisitorCount: [...visitsByUser.values()].filter((n) => n >= 2).length,
    conquerorCount: conquerors.length,
    saveCount,
  };
  await tx.restaurantStat.upsert({
    where: { restaurantId },
    update: data,
    create: { restaurantId, ...data },
  });

  // 좋았던/아쉬웠던 점 (공개 리뷰만)
  const marks = await tx.reviewAspectMark.groupBy({
    by: ['aspectId', 'polarity'],
    where: { review: { restaurantId, status: 'A' } },
    _count: { _all: true },
  });
  await tx.restaurantAspectStat.updateMany({
    where: { restaurantId },
    data: { goodCount: 0, badCount: 0 },
  });
  const byAspect = new Map<number, { good: number; bad: number }>();
  for (const m of marks) {
    const entry = byAspect.get(m.aspectId) ?? { good: 0, bad: 0 };
    if (m.polarity === 'G') entry.good = m._count._all;
    else entry.bad = m._count._all;
    byAspect.set(m.aspectId, entry);
  }
  for (const [aspectId, counts] of byAspect) {
    await tx.restaurantAspectStat.upsert({
      where: { restaurantId_aspectId: { restaurantId, aspectId } },
      update: { goodCount: counts.good, badCount: counts.bad },
      create: { restaurantId, aspectId, goodCount: counts.good, badCount: counts.bad },
    });
  }
  return data;
}
