// 아이템 그림 (피그마 먹깨비 에셋 보드 298:2900·521:12587에서 내보낸 SVG). 파일 이름 = item.code
// 탐험가 배낭·모임 단체 모자는 피그마에 그림이 없어 같은 색·선으로 새로 그렸다 (2026-11-12)

import type { ItemCategory } from '../api/mukkaebi';

const ART = import.meta.glob<string>('../assets/items/*.svg', { eager: true, import: 'default' });

/** 아이템 코드의 그림 주소 (그림이 없는 아이템이면 undefined → 종류 기호로) */
export function itemArt(code: string | null | undefined) {
  return code ? ART[`../assets/items/${code}.svg`] : undefined;
}

/** 코드 앞부분이 종류 (HAT_CREW → HAT, PROP_EXPLORER_BAG → PROP) */
export const categoryOfCode = (code: string) => code.split('_')[0] as ItemCategory;

/** 그림 원래 크기 (px, 먹깨비 몸 그림 140×150과 같은 배율) — 꾸민 먹깨비에 입힐 때 크기를 맞춘다 */
export const ITEM_SIZE: Record<string, [number, number]> = {
  CLUB_BRONZE: [71, 194],
  CLUB_GOLD: [130, 203],
  CLUB_LEGEND: [160, 218],
  CLUB_SILVER: [96, 196],
  CLUB_WOOD: [71, 202],
  FACE_HEART_SUNGLASSES: [56, 24],
  FACE_MONOCLE: [44, 45],
  FACE_MUSTACHE: [44, 16],
  FACE_ROUND_GLASSES: [50, 24],
  FACE_STAR_STICKER: [66, 20],
  FACE_STAR_SUNGLASSES: [64, 28],
  HAT_ACORN: [64, 58],
  HAT_BEAR: [64, 58],
  HAT_CHICK: [64, 60],
  HAT_CREW: [76, 48],
  HAT_CROWN: [64, 55],
  HAT_SNAPBACK: [74, 44],
  HAT_SPROUT: [64, 59],
  HAT_STRAWBERRY: [64, 59],
  PROP_COTTON_CANDY: [48, 80],
  PROP_EXPLORER_BAG: [46, 60],
  PROP_FLAG: [57, 84],
  PROP_HEART_BALLOON: [40, 90],
  PROP_ICE_CREAM: [34, 74],
  PROP_MIC: [34, 76],
  PROP_TTEOKKKOCHI: [30, 76],
};
