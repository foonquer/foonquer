import type { Db, Tx } from '../../common/db';
import { Prisma } from '../../generated/prisma/client';

// 신뢰도 가중 별점 (「신뢰 별점 계산 규칙 정리」 2026-11-13, 계수는 rating_param)
//   작성자 가중치  w_user = 1 + (T − 50) / 50  (6° → 0.12, 50° → 1, 81° → 1.62)
//   한 표의 힘     (방문자 1 · 비방문자 GUEST_VOTE) × clamp(누른 사람 온도 ÷ 50, 0.2, 1.98)
//   공감 가중치    H·N = 도움돼요·별로예요 신뢰 가중 합, s = (H − N) / (H + N), k = min(1, (H + N) / 10)
//                  w_help = 1 + HELP_POS × s × k (s ≥ 0) / 1 + HELP_NEG × s × k (s < 0)
//   리뷰 가중치    score_weight = clamp(w_user × w_help, TRUST_MIN, TRUST_MAX) × w_cons (작성자 일관성, 0.7~1.3)
//   시간 감쇠      d — 최근 6개월과 그 전 평균이 달라졌을 때만 (changeDecayOf)
//   동네 평균      m — 동 → 구 → 서울 평균을 PRIOR_BLEND개 기준으로 섞는다, 계산하는 가게의 리뷰는 뺀다 (priorMeanOf)
//   가게 별점      R = (C × m + Σ(w × r)) / (C + Σw), w = score_weight × d

/** 맛 별점 3.0 이상이면 다시 먹을 의향 (피그마 3-2 "3.0↑ 다시 먹을 의향 · 2.5↓ 재방문 의사 없음") */
export const REVISIT_INTENT_MIN_SCORE = 3;

export interface RatingParams {
  PRIOR_WEIGHT: number;
  PRIOR_BLEND: number;
  PRIOR_DEFAULT: number;
  TEMP_BASE: number;
  GUEST_VOTE: number;
  HELP_POS: number;
  HELP_NEG: number;
  HELP_FULL_COUNT: number;
  CONSISTENCY_GAMMA: number;
  DECAY_RATE: number;
  DECAY_MIN: number;
  DECAY_MONTHS: number;
  CHANGE_MIN_GAP: number;
  CHANGE_MIN_T: number;
  CHANGE_MIN_REVIEWS: number;
  TRUST_MIN: number;
  TRUST_MAX: number;
  CONSENSUS_STRENGTH: number;
  CONSENSUS_TOLERANCE: number;
  CONSENSUS_SHRINK: number;
  CONSENSUS_MIN_REVIEWS: number;
}

/** rating_param 표에 행이 없을 때 쓰는 값 (seed와 같다) */
export const DEFAULT_RATING_PARAMS: RatingParams = {
  PRIOR_WEIGHT: 5,
  PRIOR_BLEND: 30,
  PRIOR_DEFAULT: 3.5,
  TEMP_BASE: 50,
  GUEST_VOTE: 0.1,
  HELP_POS: 0.5,
  HELP_NEG: 0.3,
  HELP_FULL_COUNT: 10,
  CONSISTENCY_GAMMA: 0.3,
  DECAY_RATE: 0.7,
  DECAY_MIN: 0.3,
  DECAY_MONTHS: 6,
  CHANGE_MIN_GAP: 0.3,
  CHANGE_MIN_T: 2,
  CHANGE_MIN_REVIEWS: 5,
  TRUST_MIN: 0.1,
  TRUST_MAX: 2.0,
  CONSENSUS_STRENGTH: 32,
  CONSENSUS_TOLERANCE: 2,
  CONSENSUS_SHRINK: 3,
  CONSENSUS_MIN_REVIEWS: 10,
};

export async function loadRatingParams(db: Db): Promise<RatingParams> {
  const rows = await db.ratingParam.findMany();
  const params = { ...DEFAULT_RATING_PARAMS };
  for (const row of rows) {
    if (row.code in params) params[row.code as keyof RatingParams] = row.value.toNumber();
  }
  return params;
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/** 도움돼요·별로예요 한 표의 힘 (방문자 1 · 비방문자 GUEST_VOTE) × (누른 사람 온도 ÷ 50, 0.2~1.98) */
export function voteStrength(p: RatingParams, isVisitor: boolean, voterTemp: number) {
  return (isVisitor ? 1 : p.GUEST_VOTE) * clamp(voterTemp / p.TEMP_BASE, 0.2, 1.98);
}

/** 리뷰가 받은 도움돼요(H)·별로예요(N)의 신뢰 가중 합 (계산에 넣는 반응만, 누른 사람의 지금 온도로) */
export async function reactionSums(tx: Db, reviewId: bigint, p: RatingParams) {
  const rows = await tx.reviewReaction.findMany({
    where: { reviewId, isCounted: true, type: { in: ['H', 'U'] } },
    select: { type: true, isVisitor: true, user: { select: { trustTemp: true } } },
  });
  let helpful = 0;
  let unhelpful = 0;
  for (const r of rows) {
    const power = voteStrength(p, r.isVisitor, r.user.trustTemp.toNumber());
    if (r.type === 'H') helpful += power;
    else unhelpful += power;
  }
  return { helpful, unhelpful };
}

/** 리뷰 가중치 score_weight (함께 정복으로 나누기 전, 0.07~2.6, 소수 셋째 자리) */
export function scoreWeightOf(
  p: RatingParams,
  review: { trustTemp: number; helpful: number; unhelpful: number; consistency: number },
) {
  const wUser = 1 + (review.trustTemp - p.TEMP_BASE) / p.TEMP_BASE;
  const total = review.helpful + review.unhelpful;
  let wHelp = 1;
  if (total > 0) {
    const s = (review.helpful - review.unhelpful) / total;
    const k = Math.min(1, total / p.HELP_FULL_COUNT);
    wHelp = 1 + (s >= 0 ? p.HELP_POS : p.HELP_NEG) * s * k;
  }
  return round(clamp(wUser * wHelp, p.TRUST_MIN, p.TRUST_MAX) * review.consistency, 3);
}

const MONTH_MS = 30.44 * 24 * 60 * 60 * 1000;
const meanOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const varianceOf = (xs: number[]) => {
  const m = meanOf(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
};

/**
 * 시간 감쇠 d를 정하는 함수를 돌려준다. 가게가 바뀌었을 때만 옛 리뷰를 덜 반영한다.
 * 리뷰를 최근 DECAY_MONTHS개월(now)과 그 전(old)으로 나눠 둘 다 CHANGE_MIN_REVIEWS개 이상일 때만 판정한다.
 * Δ = now 평균 − old 평균, t = |Δ| ÷ √(s_now²/n_now + s_old²/n_old) (Welch t).
 * |Δ| ≥ CHANGE_MIN_GAP이면서 t ≥ CHANGE_MIN_T면 변화 있음 → 강도 = 1 + clamp((|Δ| − 0.3) ÷ 0.3, 0, 1),
 * d = max(DECAY_MIN, DECAY_RATE ^ (오래된 정도 × 강도)), 오래된 정도 = 최근 6개월 0 · 6개월~1년 1 · 1년 이상 2.
 * 변화가 없거나 판정할 수 없으면 d = 1
 */
export function changeDecayOf(
  p: RatingParams,
  reviews: { score: number; regDate: Date }[],
  now: Date,
): { change: number | null; decay: (regDate: Date) => number } {
  const ageOf = (regDate: Date) =>
    Math.min(
      2,
      Math.floor(Math.max(0, now.getTime() - regDate.getTime()) / (p.DECAY_MONTHS * MONTH_MS)),
    );
  const recent = reviews.filter((r) => ageOf(r.regDate) === 0).map((r) => r.score);
  const old = reviews.filter((r) => ageOf(r.regDate) > 0).map((r) => r.score);
  const none = { change: null, decay: () => 1 };
  if (recent.length < p.CHANGE_MIN_REVIEWS || old.length < p.CHANGE_MIN_REVIEWS) return none;
  const delta = meanOf(recent) - meanOf(old);
  const se = Math.sqrt(varianceOf(recent) / recent.length + varianceOf(old) / old.length);
  const t = se === 0 ? (delta === 0 ? 0 : Infinity) : Math.abs(delta) / se;
  if (Math.abs(delta) < p.CHANGE_MIN_GAP || t < p.CHANGE_MIN_T) return none;
  const strength = 1 + clamp((Math.abs(delta) - p.CHANGE_MIN_GAP) / p.CHANGE_MIN_GAP, 0, 1);
  return {
    change: round(delta, 2),
    decay: (regDate) => Math.max(p.DECAY_MIN, p.DECAY_RATE ** (ageOf(regDate) * strength)),
  };
}

/** 인증 맛 별점 합계·개수 (동네 평균 계산용) */
export type ScoreTotal = { sum: number; count: number };
export type NeighborhoodTotals = {
  dong: Map<number, ScoreTotal>;
  gu: Map<number, ScoreTotal>;
  seoul: ScoreTotal;
};

/**
 * 동네 평균 m. 동 → 구 → 서울 순서로, 리뷰가 적으면 위 단계 평균과 섞는다 (기준선으로 끊지 않아 별점이 튀지 않게).
 *   m_서울 = (n_서울 × 서울 평균 + B × PRIOR_DEFAULT) ÷ (n_서울 + B)
 *   m_구   = (n_구 × 구 평균 + B × m_서울) ÷ (n_구 + B)
 *   m_동   = (n_동 × 동 평균 + B × m_구) ÷ (n_동 + B),  B = PRIOR_BLEND
 * 모든 단계에서 계산하는 가게 자신의 리뷰(own)는 뺀다
 */
export function priorMeanOf(
  p: RatingParams,
  totals: { dong: ScoreTotal; gu: ScoreTotal; seoul: ScoreTotal },
  own: ScoreTotal,
) {
  const blend = (t: ScoreTotal, upper: number) => {
    const sum = t.sum - own.sum;
    const count = Math.max(0, t.count - own.count);
    return (sum + p.PRIOR_BLEND * upper) / (count + p.PRIOR_BLEND);
  };
  return blend(totals.dong, blend(totals.gu, blend(totals.seoul, p.PRIOR_DEFAULT)));
}

/** 동·구·서울별 공개 리뷰 맛 별점 합계 (하루 1번 모든 가게를 다시 계산할 때 한 번만 읽는다) */
export async function loadNeighborhoodTotals(db: Db): Promise<NeighborhoodTotals> {
  const rows = await db.$queryRaw<
    { region_id: number; sigungu_id: number; sum: Prisma.Decimal | number; count: bigint }[]
  >`
    SELECT r.region_id, r.sigungu_id, SUM(rv.overall_score) AS sum, COUNT(*) AS count
    FROM review rv JOIN restaurant r ON r.id = rv.restaurant_id
    WHERE rv.status = 'A'
    GROUP BY r.region_id, r.sigungu_id`;
  const totals: NeighborhoodTotals = {
    dong: new Map(),
    gu: new Map(),
    seoul: { sum: 0, count: 0 },
  };
  const add = (map: Map<number, ScoreTotal>, key: number, sum: number, count: number) => {
    const t = map.get(key) ?? { sum: 0, count: 0 };
    map.set(key, { sum: t.sum + sum, count: t.count + count });
  };
  for (const row of rows) {
    const sum = Number(row.sum);
    const count = Number(row.count);
    add(totals.dong, row.region_id, sum, count);
    add(totals.gu, row.sigungu_id, sum, count);
    totals.seoul.sum += sum;
    totals.seoul.count += count;
  }
  return totals;
}

/** 가게 하나의 동·구·서울 합계 (리뷰·반응이 바뀌어 그 가게만 다시 계산할 때) */
async function totalsOf(db: Db, regionId: number, sigunguId: number) {
  const [row] = await db.$queryRaw<
    {
      dong_sum: Prisma.Decimal | null;
      dong_count: Prisma.Decimal | bigint | null;
      gu_sum: Prisma.Decimal | null;
      gu_count: Prisma.Decimal | bigint | null;
      all_sum: Prisma.Decimal | null;
      all_count: bigint;
    }[]
  >`
    SELECT
      SUM(CASE WHEN r.region_id = ${regionId} THEN rv.overall_score ELSE 0 END) AS dong_sum,
      SUM(r.region_id = ${regionId}) AS dong_count,
      SUM(CASE WHEN r.sigungu_id = ${sigunguId} THEN rv.overall_score ELSE 0 END) AS gu_sum,
      SUM(r.sigungu_id = ${sigunguId}) AS gu_count,
      SUM(rv.overall_score) AS all_sum,
      COUNT(*) AS all_count
    FROM review rv JOIN restaurant r ON r.id = rv.restaurant_id
    WHERE rv.status = 'A'`;
  const n = (v: unknown) => Number(v ?? 0);
  return {
    dong: { sum: n(row?.dong_sum), count: n(row?.dong_count) },
    gu: { sum: n(row?.gu_sum), count: n(row?.gu_count) },
    seoul: { sum: n(row?.all_sum), count: n(row?.all_count) },
  };
}

/**
 * 리뷰 한 개의 score_weight를 지금 작성자 온도·일관성, 받은 반응의 신뢰 가중 합으로 다시 정한다.
 * 모임원과 함께 정복한 방문(crew_conquest)의 리뷰는 묶인 인원만큼 나눠 한 묶음으로 반영한다
 * (친구 5명이 같이 가서 준 5점이 남남 5명이 준 5점보다 덜 반영되게 — 나누는 정도는 팀이 정할 값, 지금은 1/인원)
 */
export async function refreshReviewWeight(tx: Tx, reviewId: bigint, params?: RatingParams) {
  const p = params ?? (await loadRatingParams(tx));
  const review = await tx.review.findUniqueOrThrow({
    where: { id: reviewId },
    select: {
      visitId: true,
      user: { select: { trustTemp: true, consistencyWeight: true } },
    },
  });
  const [sums, groups] = await Promise.all([
    reactionSums(tx, reviewId, p),
    tx.crewConquestMember.findMany({
      where: { visitId: review.visitId },
      select: { crewConquest: { select: { _count: { select: { members: true } } } } },
    }),
  ]);
  const together = Math.max(1, ...groups.map((g) => g.crewConquest._count.members));
  const scoreWeight = round(
    scoreWeightOf(p, {
      trustTemp: review.user.trustTemp.toNumber(),
      helpful: sums.helpful,
      unhelpful: sums.unhelpful,
      consistency: review.user.consistencyWeight.toNumber(),
    }) / together,
    3,
  );
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
  neighborhood?: NeighborhoodTotals,
) {
  const p = params ?? (await loadRatingParams(tx));
  const place = await tx.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { regionId: true, sigunguId: true },
  });
  const [reviews, visits, conquerors, saveCount, cover, totals] = await Promise.all([
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
    // 대표 사진: 공개 리뷰 중 가장 최근 것의 첫 사진
    tx.reviewImage.findFirst({
      where: { review: { restaurantId, status: 'A' } },
      orderBy: [{ review: { regDate: 'desc' } }, { reviewId: 'desc' }, { sortOrder: 'asc' }],
      select: { imageKey: true },
    }),
    neighborhood
      ? {
          dong: neighborhood.dong.get(place.regionId) ?? { sum: 0, count: 0 },
          gu: neighborhood.gu.get(place.sigunguId) ?? { sum: 0, count: 0 },
          seoul: neighborhood.seoul,
        }
      : totalsOf(tx, place.regionId, place.sigunguId),
  ]);
  const { decay } = changeDecayOf(
    p,
    reviews.map((r) => ({ score: r.overallScore.toNumber(), regDate: r.regDate })),
    now,
  );

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
    const w = r.scoreWeight.toNumber() * decay(r.regDate);
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
  const m = priorMeanOf(p, totals, { sum: scoreSum, count: reviews.length });
  const displayScore =
    reviews.length > 0
      ? round((p.PRIOR_WEIGHT * m + weightedScoreSum) / (p.PRIOR_WEIGHT + weightSum), 1)
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
    coverImageKey: cover?.imageKey ?? null,
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
