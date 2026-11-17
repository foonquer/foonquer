// 리뷰어 단계 (신뢰 온도 구간). 온도 숫자는 본인에게만 보여 주고,
// 다른 사람에게는 잎새(60°) 이상일 때만 단계를 보여 준다 (낮은 온도를 드러내지 않게)

export type TrustLevel = 'SEED' | 'SPROUT' | 'LEAF' | 'TREE' | 'FOREST_1' | 'FOREST_2' | 'FOREST_3';

/** 높은 단계부터: 이 온도 이상이면 그 단계 (45° 미만은 씨앗) */
const LEVEL_FROM: [from: number, level: TrustLevel][] = [
  [90, 'FOREST_3'],
  [85, 'FOREST_2'],
  [80, 'FOREST_1'],
  [70, 'TREE'],
  [60, 'LEAF'],
  [45, 'SPROUT'],
];

/** 다른 사람에게 단계가 보이기 시작하는 온도 (잎새) */
const PUBLIC_FROM = 60;

export function trustLevelOf(temp: number): TrustLevel {
  return LEVEL_FROM.find(([from]) => temp >= from)?.[1] ?? 'SEED';
}

/** 보는 사람에 따라: 본인은 온도·단계, 다른 사람은 잎새 이상일 때 단계만 */
export function trustViewOf(temp: number, isMe: boolean) {
  if (isMe) return { trustTemp: temp, trustLevel: trustLevelOf(temp) };
  return { trustTemp: null, trustLevel: temp >= PUBLIC_FROM ? trustLevelOf(temp) : null };
}
