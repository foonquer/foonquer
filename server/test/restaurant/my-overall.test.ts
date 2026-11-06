import { describe, expect, it } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client';
import { myOverallOf } from '../../src/modules/restaurant/restaurant-stats';
import { DEFAULT_WEIGHTS, weightPercents } from '../../src/modules/user/taste-weights';

type Stat = Parameters<typeof myOverallOf>[0];

/** 맛 별점 4.4, 세부 평가 10개 (청결 4.3·양 4.4·서비스 4.5·가격 4.2) — 피그마 3-2 계산 보기 예시 */
function stat(overrides: Record<string, unknown> = {}): Stat {
  return {
    reviewCount: 12,
    displayScore: new Prisma.Decimal(4.4),
    detailReviewCount: 10,
    cleanlinessSum: 43,
    portionSum: 44,
    serviceSum: 45,
    priceSum: 42,
    ...overrides,
  } as unknown as Stat;
}

// 맛·청결 아주 중요, 양·서비스 보통, 가격 중요
const FIGMA = { taste: 3, cleanliness: 3, portion: 1, service: 1, price: 2 };

describe('weightPercents — 내 취향 비중', () => {
  it('내 점수 ÷ 합계, 합이 100이 되게 나눈다', () => {
    expect(weightPercents(FIGMA)).toEqual({
      taste: 30,
      cleanliness: 30,
      portion: 10,
      service: 10,
      price: 20,
    });
    // 1/7 = 14.28…%, 3/7 = 42.85…% → 나머지가 큰 순서로 1씩 더한다
    expect(weightPercents({ ...DEFAULT_WEIGHTS, service: 3 })).toEqual({
      taste: 15,
      cleanliness: 14,
      portion: 14,
      service: 43,
      price: 14,
    });
  });

  it('고른 항목끼리만 다시 나눈다', () => {
    expect(weightPercents(FIGMA, ['taste', 'price'])).toEqual({ taste: 60, price: 40 });
  });
});

describe('myOverallOf — 내 종합 별점', () => {
  it('항목 평균 × 내 취향 비중 (4.4×0.3 + 4.3×0.3 + 4.4×0.1 + 4.5×0.1 + 4.2×0.2 = 4.34 → 4.3)', () => {
    expect(myOverallOf(stat(), FIGMA)).toEqual({
      score: 4.3,
      items: [
        { key: 'taste', average: 4.4, weightPercent: 30 },
        { key: 'cleanliness', average: 4.3, weightPercent: 30 },
        { key: 'portion', average: 4.4, weightPercent: 10 },
        { key: 'service', average: 4.5, weightPercent: 10 },
        { key: 'price', average: 4.2, weightPercent: 20 },
      ],
    });
  });

  it('세부 평가가 없으면 맛 별점만으로 계산한다', () => {
    const r = myOverallOf(stat({ detailReviewCount: 0 }), FIGMA);
    expect(r.score).toBe(4.4);
    expect(r.items[0]).toEqual({ key: 'taste', average: 4.4, weightPercent: 100 });
    expect(r.items[1]).toEqual({ key: 'cleanliness', average: null, weightPercent: null });
  });

  it('맛 별점이 없으면 null', () => {
    expect(myOverallOf(null, FIGMA).score).toBeNull();
    expect(myOverallOf(stat({ displayScore: null }), FIGMA)).toMatchObject({
      score: null,
      items: [{ key: 'taste', average: null, weightPercent: null }, {}, {}, {}, {}],
    });
  });
});
