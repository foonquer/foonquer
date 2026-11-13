import type { Db } from '../../common/db';
import { addDays, kstStartOfDbDate, kstWeekStartAsDbDate } from '../../common/time';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { clamp, type RatingParams } from '../restaurant/restaurant-stat-calc';
import { changeTrustTemp } from './trust-temp';

// 합의 일치도 (「신뢰 별점 계산 규칙 정리」 2026-11-13 4장, Dawid–Skene 방식)
//   내 평균 어긋남 e  = 내 공개 리뷰들의 |내 별점 − 그 가게의 지금 신뢰 별점| 평균
//   보통 어긋남 ē    = 리뷰 2개 이상인 리뷰어들의 e 평균 (사는 동네 구, 리뷰어가 적으면 서울 전체)
//   일관성 가중치     w_cons = clamp(1 + γ × (ē − e) ÷ ē, 1 − γ, 1 + γ) (리뷰 2개 이상만, 아니면 1)
//   감점 (매주)       e > 2ē일 때만 32 × n ÷ (n + 3) × (e − 2ē) ÷ ē × 지난주 새 리뷰 수, 리뷰 10개부터(11/13 팀 결정)
// 감점은 내리는 데만 쓰고, 이유는 사용자에게 보여 주지 않는다

/** 구의 보통 어긋남을 이만큼의 리뷰어(리뷰 2개 이상)로 잴 수 있어야 그 구 값을 쓴다. 적으면 서울 전체 */
export const NEIGHBOR_MIN_REVIEWERS = 10;
/** 한 번에 깎는 온도의 상한. 온도 범위(1°~99°)보다 크게 깎을 일은 없다 (trust_temp_log.base_delta decimal(4,2)) */
const MAX_PENALTY = 98;

export type ReviewerGap = {
  userId: bigint;
  /** 내 평균 어긋남 e */
  gap: number;
  /** 어긋남을 잰 리뷰 수 n */
  reviewCount: number;
  /** 사는 동네(내 동네 0번)의 구 */
  sigunguId: number | null;
};

/** 공개 리뷰를 쓴 사람마다 내 평균 어긋남 e */
export async function loadReviewerGaps(db: Db): Promise<ReviewerGap[]> {
  const rows = await db.$queryRaw<
    {
      user_id: bigint;
      gap: Prisma.Decimal | number;
      n: bigint;
      sigungu_id: number | null;
    }[]
  >`
    SELECT rv.user_id,
      AVG(ABS(rv.overall_score - rs.display_score)) AS gap,
      COUNT(*) AS n,
      (SELECT l.sigungu_id FROM member_local_region l
        WHERE l.user_id = rv.user_id ORDER BY l.sort_order, l.id LIMIT 1) AS sigungu_id
    FROM review rv JOIN restaurant_stat rs ON rs.restaurant_id = rv.restaurant_id
    WHERE rv.status = 'A' AND rs.display_score IS NOT NULL
    GROUP BY rv.user_id`;
  return rows.map((r) => ({
    userId: BigInt(r.user_id),
    gap: Number(r.gap),
    reviewCount: Number(r.n),
    sigunguId: r.sigungu_id === null ? null : Number(r.sigungu_id),
  }));
}

const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** 보통 어긋남 ē를 구마다 정하는 함수. 리뷰어가 없으면 null (일관성·감점 모두 계산하지 않는다) */
export function typicalGapOf(gaps: ReviewerGap[]) {
  const eligible = gaps.filter((g) => g.reviewCount >= 2);
  const seoul = meanOf(eligible.map((g) => g.gap));
  const byGu = new Map<number, number[]>();
  for (const g of eligible) {
    if (g.sigunguId === null) continue;
    byGu.set(g.sigunguId, [...(byGu.get(g.sigunguId) ?? []), g.gap]);
  }
  return (sigunguId: number | null) => {
    const list = sigunguId === null ? undefined : byGu.get(sigunguId);
    return list && list.length >= NEIGHBOR_MIN_REVIEWERS ? meanOf(list) : seoul;
  };
}

/** 일관성 가중치 w_cons (소수 둘째 자리) */
export function consistencyOf(
  p: RatingParams,
  gap: number,
  typical: number | null,
  reviewCount: number,
) {
  if (reviewCount < 2 || !typical) return 1;
  const g = p.CONSISTENCY_GAMMA;
  return Math.round(clamp(1 + (g * (typical - gap)) / typical, 1 - g, 1 + g) * 100) / 100;
}

/** 새 리뷰 하나에 깎는 온도 (양수, 0이면 깎지 않는다) */
export function consensusPenaltyOf(
  p: RatingParams,
  gap: number,
  typical: number | null,
  reviewCount: number,
) {
  if (!typical || reviewCount < p.CONSENSUS_MIN_REVIEWS) return 0;
  const over = gap - p.CONSENSUS_TOLERANCE * typical;
  if (over <= 0) return 0;
  const shrink = reviewCount / (reviewCount + p.CONSENSUS_SHRINK);
  return (p.CONSENSUS_STRENGTH * shrink * over) / typical;
}

/**
 * 하루 1번 rating 작업이 가게 별점을 다시 계산하기 전에 부른다.
 * 1) 지난주(KST 월~일) 새 리뷰를 쓴 사람의 합의 일치도 감점 — 지난주 마지막 새 리뷰를 원인으로 남겨, 여러 날 돌아도 한 번만 깎는다
 * 2) 모든 리뷰어의 일관성 가중치 (공개 리뷰가 없어진 사람은 1로)
 */
export async function runConsensus(p: RatingParams, now = new Date()) {
  const gaps = await loadReviewerGaps(prisma);
  const typicalOf = typicalGapOf(gaps);
  const byUser = new Map(gaps.map((g) => [g.userId.toString(), g]));

  const weekStart = kstStartOfDbDate(kstWeekStartAsDbDate(now));
  const written = await prisma.review.groupBy({
    by: ['userId'],
    where: { status: 'A', regDate: { gte: addDays(weekStart, -7), lt: weekStart } },
    _count: { _all: true },
    _max: { id: true },
  });
  let penalized = 0;
  for (const w of written) {
    const g = byUser.get(w.userId.toString());
    const lastReviewId = w._max.id;
    if (!g || lastReviewId === null) continue;
    const perReview = consensusPenaltyOf(p, g.gap, typicalOf(g.sigunguId), g.reviewCount);
    if (perReview <= 0) continue;
    const applied = await prisma.$transaction((tx) =>
      changeTrustTemp(
        tx,
        w.userId,
        'CONSENSUS_GAP',
        { type: 'REVIEW', id: lastReviewId },
        null,
        now,
        Math.min(MAX_PENALTY, perReview * w._count._all),
      ),
    );
    if (applied !== null) penalized += 1;
  }

  let consistencyUpdated = 0;
  for (const g of gaps) {
    const weight = consistencyOf(p, g.gap, typicalOf(g.sigunguId), g.reviewCount);
    const { count } = await prisma.member.updateMany({
      where: { id: g.userId, NOT: { consistencyWeight: weight } },
      data: { consistencyWeight: weight },
    });
    consistencyUpdated += count;
  }
  const reset = await prisma.member.updateMany({
    where: { id: { notIn: gaps.map((g) => g.userId) }, NOT: { consistencyWeight: 1 } },
    data: { consistencyWeight: 1 },
  });
  return {
    reviewers: gaps.length,
    penalized,
    consistencyUpdated: consistencyUpdated + reset.count,
  };
}
