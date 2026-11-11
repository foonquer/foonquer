// 사진이 없는 가게에 보여 줄 음식 종류 그림과 바탕색 (카테고리 이름 → 그림)

import asian from '../assets/illust/food/asian.svg';
import cafe from '../assets/illust/food/cafe.svg';
import chicken from '../assets/illust/food/chicken.svg';
import chinese from '../assets/illust/food/chinese.svg';
import etc from '../assets/illust/food/etc.svg';
import fastfood from '../assets/illust/food/fastfood.svg';
import japanese from '../assets/illust/food/japanese.svg';
import korean from '../assets/illust/food/korean.svg';
import meat from '../assets/illust/food/meat.svg';
import seafood from '../assets/illust/food/seafood.svg';
import snack from '../assets/illust/food/snack.svg';
import western from '../assets/illust/food/western.svg';

type FoodArt = { src: string; bg: string };

/** 카테고리(서버 seed category 이름)마다 그림·바탕색 */
const ART: Record<string, FoodArt> = {
  한식: { src: korean, bg: '#F3E4CF' },
  중식: { src: chinese, bg: '#F7DDD5' },
  일식: { src: japanese, bg: '#E2EBEF' },
  양식: { src: western, bg: '#F2E8D3' },
  분식: { src: snack, bg: '#FCE2D8' },
  고깃집: { src: meat, bg: '#F3DED2' },
  해산물: { src: seafood, bg: '#DDEBF1' },
  치킨: { src: chicken, bg: '#FCEBCB' },
  패스트푸드: { src: fastfood, bg: '#FBE6C6' },
  아시안: { src: asian, bg: '#E3EEDA' },
  '카페·디저트': { src: cafe, bg: '#EFE3D8' },
};

const DEFAULT_ART: FoodArt = { src: etc, bg: '#EFE2CE' };

export function foodArtOf(categoryName: string | null | undefined): FoodArt {
  return (categoryName && ART[categoryName]) || DEFAULT_ART;
}
