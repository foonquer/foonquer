import { prisma } from '../../lib/prisma';

// 내 취향 (ERD v1.4, 피그마 3-2 "맛집 고를 때 무엇을 중요하게 보세요?")
// 항목마다 보통 1 / 중요 2 / 아주 중요 3. 비중 = 내 점수 ÷ 다섯 항목 합 (예: 3·3·1·1·2 → 30·30·10·10·20%)

export const TASTE_KEYS = ['taste', 'cleanliness', 'portion', 'service', 'price'] as const;
export type TasteKey = (typeof TASTE_KEYS)[number];
export type TasteWeights = Record<TasteKey, number>;

export const WEIGHT_LEVELS = ['NORMAL', 'IMPORTANT', 'VERY'] as const;
export type WeightLevel = (typeof WEIGHT_LEVELS)[number];

/** 고르지 않았으면 모두 보통 (같은 비중) */
export const DEFAULT_WEIGHTS: TasteWeights = {
  taste: 1,
  cleanliness: 1,
  portion: 1,
  service: 1,
  price: 1,
};

export const levelOf = (weight: number): WeightLevel => WEIGHT_LEVELS[weight - 1] ?? 'NORMAL';
export const weightOf = (level: WeightLevel) => WEIGHT_LEVELS.indexOf(level) + 1;

type WeightColumns = {
  weightTaste: number;
  weightCleanliness: number;
  weightPortion: number;
  weightService: number;
  weightPrice: number;
};

export const WEIGHT_SELECT = {
  weightTaste: true,
  weightCleanliness: true,
  weightPortion: true,
  weightService: true,
  weightPrice: true,
} as const;

export function weightsOf(m: WeightColumns): TasteWeights {
  return {
    taste: m.weightTaste,
    cleanliness: m.weightCleanliness,
    portion: m.weightPortion,
    service: m.weightService,
    price: m.weightPrice,
  };
}

export function toWeightColumns(levels: Record<TasteKey, WeightLevel>): WeightColumns {
  return {
    weightTaste: weightOf(levels.taste),
    weightCleanliness: weightOf(levels.cleanliness),
    weightPortion: weightOf(levels.portion),
    weightService: weightOf(levels.service),
    weightPrice: weightOf(levels.price),
  };
}

/** 로그인한 회원의 취향 (회원이 없으면 기본값) */
export async function loadTasteWeights(userId: bigint): Promise<TasteWeights> {
  const m = await prisma.member.findUnique({ where: { id: userId }, select: WEIGHT_SELECT });
  return m ? weightsOf(m) : DEFAULT_WEIGHTS;
}

/**
 * 고른 항목들의 비중(%)을 합이 100이 되게 나눈다 (가장 큰 나머지 방식).
 * keys에 없는 항목은 비중을 주지 않는다 (가게에 그 항목 평균이 없을 때)
 */
export function weightPercents(weights: TasteWeights, keys: readonly TasteKey[] = TASTE_KEYS) {
  const total = keys.reduce((sum, k) => sum + weights[k], 0);
  const raw = keys.map((k) => ({ k, exact: (weights[k] * 100) / total }));
  const floors = raw.map((r) => ({ ...r, value: Math.floor(r.exact) }));
  let left = 100 - floors.reduce((sum, r) => sum + r.value, 0);
  for (const r of [...floors].sort((a, b) => b.exact - b.value - (a.exact - a.value))) {
    if (left <= 0) break;
    r.value += 1;
    left -= 1;
  }
  return Object.fromEntries(floors.map((r) => [r.k, r.value])) as Partial<Record<TasteKey, number>>;
}

function toView(weights: TasteWeights) {
  const percents = weightPercents(weights);
  return {
    items: TASTE_KEYS.map((key) => ({
      key,
      level: levelOf(weights[key]),
      weightPercent: percents[key] ?? 0,
    })),
  };
}

/** USER-09 내 취향 조회 (설정 → 내 취향 설정, "이렇게 반영돼요" 막대) */
export async function getTasteWeights(userId: bigint) {
  return toView(await loadTasteWeights(userId));
}

/** USER-10 내 취향 저장 (다섯 항목을 한 번에) */
export async function updateTasteWeights(userId: bigint, levels: Record<TasteKey, WeightLevel>) {
  const m = await prisma.member.update({
    where: { id: userId },
    data: toWeightColumns(levels),
    select: WEIGHT_SELECT,
  });
  return toView(weightsOf(m));
}
