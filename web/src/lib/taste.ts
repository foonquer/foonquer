// 맛 별점 기준표와 내 취향 (피그마 3-2 "맛 별점 · 내 종합 별점")

import type { TasteKey } from '../api/restaurants';
import type { TasteWeights, WeightLevel } from '../api/users';

/** 먹장깨기 맛 기준 (0.5 ~ 5.0). 3.0 이상이면 다시 먹을 의향 */
export const TASTE_CRITERIA = [
  { score: 5, text: '멀리서도 일부러 먹으러 갈 맛' },
  { score: 4.5, text: '기다릴 가치가 있는 맛' },
  { score: 4, text: '다른 사람에게 추천할 수 있는 맛' },
  { score: 3.5, text: '근처에 있다면 다시 먹고 싶은 맛' },
  { score: 3, text: '무난하게 한 끼 먹기 괜찮은 맛' },
  { score: 2.5, text: '평범하지만 재방문 의사는 없는 맛' },
  { score: 2, text: '아쉬운 점이 있어 다시 먹고 싶지 않은 맛' },
  { score: 1.5, text: '맛에 대한 불만이 커 추천하기 어려운 맛' },
  { score: 1, text: '먹는 동안 계속 맛없다고 느껴지는 맛' },
  { score: 0.5, text: '먹기 어려울 정도로 맛이 좋지 않은 맛' },
] as const;

export const TASTE_CRITERIA_NOTE = '3.0↑ 다시 먹을 의향 · 2.5↓ 재방문 의사 없음';

/** 그 점수(0.5 단위로 내림)의 기준 문구. 4.4 → "다른 사람에게 추천할 수 있는 맛" */
export function tasteCriterion(score: number) {
  const step = Math.floor(score * 2) / 2;
  return TASTE_CRITERIA.find((c) => c.score <= step) ?? TASTE_CRITERIA[TASTE_CRITERIA.length - 1];
}

/** 가게 맛 별점의 점수대 (맛 기준표와 같은 0.5점 구간, 「신뢰 별점 계산 규칙 정리」). 3.6 → "3.5점대", 4.4 → "4.0점대" */
export function scoreBand(score: number) {
  return `${(Math.floor(score * 2) / 2).toFixed(1)}점대`;
}

export const TASTE_ITEMS: { key: TasteKey; label: string; hint: string }[] = [
  { key: 'taste', label: '맛', hint: '먹을 만한지, 또 먹고 싶은지' },
  { key: 'cleanliness', label: '청결', hint: '매장·식기·화장실' },
  { key: 'portion', label: '양', hint: '가격 대비 든든한지' },
  { key: 'service', label: '서비스', hint: '친절·응대 속도' },
  { key: 'price', label: '가격', hint: '가성비' },
];

export const WEIGHT_LEVELS: { value: WeightLevel; label: string; weight: number }[] = [
  { value: 'NORMAL', label: '보통', weight: 1 },
  { value: 'IMPORTANT', label: '중요', weight: 2 },
  { value: 'VERY', label: '아주 중요', weight: 3 },
];

export const DEFAULT_TASTE_WEIGHTS: TasteWeights = {
  taste: 'NORMAL',
  cleanliness: 'NORMAL',
  portion: 'NORMAL',
  service: 'NORMAL',
  price: 'NORMAL',
};

const weightOf = (level: WeightLevel) => WEIGHT_LEVELS.find((l) => l.value === level)?.weight ?? 1;

/** 비중(%) — 서버와 같게 내 점수 ÷ 합계, 합이 100이 되게 나머지가 큰 순서로 1씩 더한다 */
export function weightPercents(weights: TasteWeights): Record<TasteKey, number> {
  const total = TASTE_ITEMS.reduce((sum, i) => sum + weightOf(weights[i.key]), 0);
  const rows = TASTE_ITEMS.map((i) => {
    const exact = (weightOf(weights[i.key]) * 100) / total;
    return { key: i.key, exact, value: Math.floor(exact) };
  });
  let left = 100 - rows.reduce((sum, r) => sum + r.value, 0);
  for (const r of [...rows].sort((a, b) => b.exact - b.value - (a.exact - a.value))) {
    if (left <= 0) break;
    r.value += 1;
    left -= 1;
  }
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<TasteKey, number>;
}

/** "맛 30% · 청결 30% · 가격 20% · 양 10% · 서비스 10%" (비중 큰 순) */
export function weightSummary(weights: TasteWeights) {
  const percents = weightPercents(weights);
  return [...TASTE_ITEMS]
    .sort((a, b) => percents[b.key] - percents[a.key])
    .map((i) => `${i.label} ${percents[i.key]}%`)
    .join(' · ');
}

/** 설정 메뉴 줄 오른쪽: 아주 중요(없으면 중요)로 고른 항목. "맛·청결 중시" / 모두 보통이면 "모두 같게" */
export function weightBrief(weights: TasteWeights) {
  for (const level of ['VERY', 'IMPORTANT'] as const) {
    const keys = TASTE_ITEMS.filter((i) => weights[i.key] === level).map((i) => i.label);
    if (keys.length > 0) return `${keys.join('·')} 중시`;
  }
  return '모두 같게';
}

/** 피그마 예시 가게 (맛 4.4·청결 4.3·양 4.4·서비스 4.5·가격 4.2)로 내 종합 별점 미리 보기 */
const SAMPLE: Record<TasteKey, number> = {
  taste: 4.4,
  cleanliness: 4.3,
  portion: 4.4,
  service: 4.5,
  price: 4.2,
};
export function sampleMyOverall(weights: TasteWeights) {
  const total = TASTE_ITEMS.reduce((sum, i) => sum + weightOf(weights[i.key]), 0);
  const sum = TASTE_ITEMS.reduce((acc, i) => acc + SAMPLE[i.key] * weightOf(weights[i.key]), 0);
  return { taste: SAMPLE.taste, myOverall: Math.round((sum / total) * 10) / 10 };
}
