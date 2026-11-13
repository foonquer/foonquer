import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/common/time';
import {
  DEFAULT_RATING_PARAMS as p,
  changeDecayOf,
  priorMeanOf,
  scoreWeightOf,
  voteStrength,
} from '../../src/modules/restaurant/restaurant-stat-calc';
import {
  type ReviewerGap,
  consensusPenaltyOf,
  consistencyOf,
  typicalGapOf,
} from '../../src/modules/review/consensus';

// 「신뢰 별점 계산 규칙 정리」(2026-11-13)의 식과 예시

describe('voteStrength — 도움돼요·별로예요 한 표의 힘', () => {
  it.each([
    [true, 50, 1],
    [false, 50, 0.1],
    [true, 99, 1.98],
    [true, 5, 0.2], // 온도 배율 하한 0.2
  ])('방문자 %s, 누른 사람 %s° → %s', (isVisitor, temp, expected) => {
    expect(voteStrength(p, isVisitor, temp)).toBeCloseTo(expected, 10);
  });
});

describe('scoreWeightOf — 리뷰 가중치 clamp(w_user × w_help, 0.1, 2.0) × w_cons', () => {
  const none = { helpful: 0, unhelpful: 0, consistency: 1 };
  it.each([
    [50, 1],
    [81, 1.62],
    [6, 0.12],
  ])('반응이 없으면 w_user = 1 + (T − 50) ÷ 50 (%s° → %s)', (trustTemp, expected) => {
    expect(scoreWeightOf(p, { trustTemp, ...none })).toBe(expected);
  });

  it('도움돼요·별로예요는 합이 10이 될 때까지 덜 반영한다 (k = 합 ÷ 10)', () => {
    // s = 1, k = 0.4 → 1 + 0.5 × 0.4 = 1.2
    expect(scoreWeightOf(p, { ...none, trustTemp: 50, helpful: 4 })).toBe(1.2);
    // s = −1, k = 1 → 1 − 0.3 = 0.7
    expect(scoreWeightOf(p, { ...none, trustTemp: 50, unhelpful: 10 })).toBe(0.7);
    // s = (6 − 2) ÷ 8 = 0.5, k = 0.8 → 1 + 0.5 × 0.5 × 0.8 = 1.2
    expect(scoreWeightOf(p, { ...none, trustTemp: 50, helpful: 6, unhelpful: 2 })).toBe(1.2);
  });

  it('w_user × w_help를 0.1~2.0으로 자른 뒤 일관성 가중치를 곱한다 (0.07~2.6)', () => {
    expect(scoreWeightOf(p, { trustTemp: 99, helpful: 10, unhelpful: 0, consistency: 1.3 })).toBe(
      2.6,
    );
    expect(scoreWeightOf(p, { trustTemp: 1, helpful: 0, unhelpful: 10, consistency: 0.7 })).toBe(
      0.07,
    );
  });
});

describe('changeDecayOf — 가게가 바뀌었을 때만 옛 리뷰를 덜 반영한다', () => {
  const now = new Date('2026-11-13T03:00:00Z');
  const at = (days: number) => addDays(now, -days);
  const reviews = (old: number[], recent: number[], oldDays = 400) => [
    ...old.map((score) => ({ score, regDate: at(oldDays) })),
    ...recent.map((score) => ({ score, regDate: at(10) })),
  ];

  it('최근 6개월과 그 전이 둘 다 5개 이상이 아니면 판정하지 않는다 (d = 1)', () => {
    const { change, decay } = changeDecayOf(p, reviews([1, 1, 1, 1], [5, 5, 5, 5, 5]), now);
    expect(change).toBeNull();
    expect(decay(at(400))).toBe(1);
  });

  it('평균 차이가 0.3점 미만이거나 t가 2 미만이면 변화 없음', () => {
    expect(changeDecayOf(p, reviews([4, 4, 4, 4, 4], [4.2, 4.2, 4.2, 4.2, 4.2]), now).change).toBe(
      null,
    );
    // 차이 0.4점이지만 흩어짐이 커서 t ≈ 0.3
    expect(changeDecayOf(p, reviews([1, 5, 1, 5, 3], [5, 1, 5, 1, 5]), now).change).toBeNull();
  });

  it('크게 바뀌면 강도 2, 1년 넘은 리뷰는 max(0.3, 0.7^(2 × 2)) = 0.3', () => {
    const { change, decay } = changeDecayOf(
      p,
      reviews([1, 1.5, 1, 1.5, 1], [5, 4.5, 5, 4.5, 5]),
      now,
    );
    expect(change).toBe(3.6);
    expect(decay(at(400))).toBe(0.3);
    expect(decay(at(200))).toBeCloseTo(0.49, 10); // 6개월~1년: 0.7^(1 × 2)
    expect(decay(at(10))).toBe(1);
  });

  it('차이 0.5점이면 강도 = 1 + (0.5 − 0.3) ÷ 0.3', () => {
    const { change, decay } = changeDecayOf(
      p,
      reviews([4, 4, 4, 4, 4.5], [4.5, 4.5, 4.5, 4.5, 5], 200),
      now,
    );
    expect(change).toBe(0.5);
    expect(decay(at(200))).toBeCloseTo(0.7 ** (1 + 0.2 / 0.3), 10);
  });
});

describe('priorMeanOf — 동네 평균 m (동 → 구 → 서울, 30개 기준으로 섞는다)', () => {
  const empty = { sum: 0, count: 0 };

  it('리뷰가 하나도 없으면 기본값 3.5', () => {
    expect(priorMeanOf(p, { dong: empty, gu: empty, seoul: empty }, empty)).toBe(3.5);
  });

  // 문서 예시: 동 평균 3.9, 구 평균 3.6 (m_구 = 3.6이 되게 기본값을 3.6으로 두고 구·서울은 비운다)
  it.each([
    [0, 3.6],
    [10, 3.68],
    [30, 3.75],
    [100, 3.83],
    [300, 3.87],
  ])('동 인증 리뷰 %s개 → m = %s', (n, expected) => {
    const dong = { sum: 3.9 * n, count: n };
    const m = priorMeanOf({ ...p, PRIOR_DEFAULT: 3.6 }, { dong, gu: empty, seoul: empty }, empty);
    expect(Math.round(m * 100) / 100).toBe(expected);
  });

  it('모든 단계에서 계산하는 가게 자신의 리뷰는 뺀다', () => {
    const own = { sum: 9, count: 2 };
    const others = { dong: { sum: 12, count: 3 }, gu: { sum: 380, count: 100 } };
    const seoul = { sum: 3600, count: 1000 };
    const plus = (t: { sum: number; count: number }) => ({
      sum: t.sum + own.sum,
      count: t.count + own.count,
    });
    expect(
      priorMeanOf(p, { dong: plus(others.dong), gu: plus(others.gu), seoul: plus(seoul) }, own),
    ).toBeCloseTo(priorMeanOf(p, { ...others, seoul }, empty), 10);
  });
});

describe('합의 일치도', () => {
  const gap = (userId: number, value: number, reviewCount: number, sigunguId: number | null) =>
    ({ userId: BigInt(userId), gap: value, reviewCount, sigunguId }) satisfies ReviewerGap;

  it('보통 어긋남 ē는 리뷰 2개 이상인 사람의 평균, 구에 그런 사람이 10명 이상이면 구 값', () => {
    const gangseo = Array.from({ length: 10 }, (_, i) => gap(i + 1, 0.4, 3, 1));
    const others = [gap(11, 1.0, 2, 2), gap(12, 9, 1, 2)]; // 리뷰 1개는 빼고 센다
    const typical = typicalGapOf([...gangseo, ...others]);
    expect(typical(1)).toBeCloseTo(0.4, 10);
    expect(typical(2)).toBeCloseTo((0.4 * 10 + 1.0) / 11, 10); // 구에 1명뿐 → 서울 전체
    expect(typical(null)).toBeCloseTo((0.4 * 10 + 1.0) / 11, 10);
    expect(typicalGapOf([gap(1, 1, 1, 1)])(1)).toBeNull();
  });

  it.each([
    [0, 2, 1.3],
    [0.6, 2, 1],
    [1.2, 2, 0.7],
    [0.72, 5, 0.94],
    [0, 1, 1], // 리뷰 1개면 계산하지 않는다
  ])('일관성 가중치: e %s, 리뷰 %s개 (ē 0.6) → %s', (e, n, expected) => {
    expect(consistencyOf(p, e, 0.6, n)).toBe(expected);
  });

  // 문서 표 (ē = 0.6, 새 리뷰 1개): 감점 시작 리뷰 수만 빼고 같은 식
  it.each([
    [1.2, 5, 0],
    [1.3, 5, 3.3],
    [1.5, 5, 10],
    [2.0, 4, 24.4],
    [2.2, 4, 30.5],
  ])('감점 = 32 × n ÷ (n + 3) × (e − 2ē) ÷ ē: e %s, 리뷰 %s개 → %s°', (e, n, expected) => {
    const any = { ...p, CONSENSUS_MIN_REVIEWS: 2 };
    expect(Math.round(consensusPenaltyOf(any, e, 0.6, n) * 10) / 10).toBe(expected);
  });

  it('리뷰 10개부터 감점한다 (11/13 팀 결정)', () => {
    expect(consensusPenaltyOf(p, 1.5, 0.6, 9)).toBe(0);
    expect(consensusPenaltyOf(p, 1.5, 0.6, 10)).toBeCloseTo((32 * 10) / 13 / 2, 10);
    expect(consensusPenaltyOf(p, 1.5, null, 10)).toBe(0);
  });
});
