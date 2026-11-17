/**
 * 리뷰어 단계 (신뢰 온도 구간). 온도 숫자는 본인에게만 오고,
 * 다른 사람은 잎새(60°) 이상일 때만 단계가 온다 (아니면 null)
 */
export type TrustLevel = 'SEED' | 'SPROUT' | 'LEAF' | 'TREE' | 'FOREST_1' | 'FOREST_2' | 'FOREST_3';

export const TRUST_LEVEL_NAME: Record<TrustLevel, string> = {
  SEED: '씨앗',
  SPROUT: '새싹',
  LEAF: '잎새',
  TREE: '나무',
  FOREST_1: '숲★',
  FOREST_2: '숲★★',
  FOREST_3: '숲★★★',
};
