// 먹깨비 그림에 쓸 착용 아이템 (칸 → 이름·등급)

import type { ItemCategory, MyMukkaebi, Rarity } from '../api/mukkaebi';

export type Wearing = Partial<Record<ItemCategory, { name: string; rarity?: Rarity } | null>>;

/** CHAR-01 착용 정보 → 그림에 쓸 값 */
export function wearingOf(m: Pick<MyMukkaebi, 'equipped'>): Wearing {
  return {
    HAT: m.equipped.hat,
    FACE: m.equipped.face,
    PROP: m.equipped.prop,
    SKIN: m.equipped.skin,
    CLUB: m.equipped.club,
  };
}
