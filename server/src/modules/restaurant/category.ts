import { AppError } from '../../common/errors/app-error';
import { prisma } from '../../lib/prisma';
import { RestaurantError } from './restaurant.errors';

/**
 * 우리 카테고리 id (prisma/seed-data.ts와 같은 순서, 명세서 "주요 코드값 2. 음식점 카테고리").
 * 공공데이터 상권업종 소분류를 이 12개로 바꿔 restaurant.category_id에 저장한다.
 */
export const CategoryId = {
  KOREAN: 1,
  CHINESE: 2,
  JAPANESE: 3,
  WESTERN: 4,
  BUNSIK: 5,
  MEAT: 6,
  SEAFOOD: 7,
  CHICKEN: 8,
  FAST_FOOD: 9,
  ASIAN: 10,
  CAFE_DESSERT: 11,
  ETC: 12,
} as const;

// 상권업종 분류(대분류 I2 음식). 소분류 코드 6자리 = 중분류 코드 4자리 + 2자리
const BY_MIDDLE: Record<string, number> = {
  I201: CategoryId.KOREAN,
  I202: CategoryId.CHINESE,
  I203: CategoryId.JAPANESE,
  I204: CategoryId.WESTERN,
  I205: CategoryId.ASIAN,
  I212: CategoryId.CAFE_DESSERT,
};

const BY_SMALL: Record<string, number> = {
  I20103: CategoryId.MEAT, // 족발/보쌈
  I20107: CategoryId.MEAT, // 돼지고기 구이/찜
  I20108: CategoryId.MEAT, // 소고기 구이/찜
  I20109: CategoryId.MEAT, // 곱창 전골/구이
  I20110: CategoryId.MEAT, // 닭/오리고기 구이/찜
  I20111: CategoryId.SEAFOOD, // 횟집
  I20112: CategoryId.SEAFOOD, // 해산물 구이/찜
  I20113: CategoryId.SEAFOOD, // 복 요리 전문
  I21001: CategoryId.CAFE_DESSERT, // 빵/도넛
  I21002: CategoryId.CAFE_DESSERT, // 떡/한과
  I21003: CategoryId.WESTERN, // 피자
  I21004: CategoryId.FAST_FOOD, // 버거
  I21005: CategoryId.FAST_FOOD, // 토스트/샌드위치/샐러드
  I21006: CategoryId.CHICKEN, // 치킨
  I21007: CategoryId.BUNSIK, // 김밥/만두/분식
  I21008: CategoryId.CAFE_DESSERT, // 아이스크림/빙수
};

/**
 * 손님이 찾아가 먹는 가게가 아니라서 가져오지 않는 소분류.
 * 구내식당, 출장 뷔페, 일반 유흥 주점, 무도 유흥 주점
 */
export const EXCLUDED_INDUSTRY_CODES = new Set(['I20701', 'I20801', 'I21101', 'I21102']);

/**
 * 상권업종 소분류 코드 → 우리 카테고리 id. 모든 가게는 카테고리가 있다(안 맞으면 기타).
 * 예) I20107 돼지고기 구이/찜 → 6 고깃집, I21201 카페 → 11 카페·디저트, I21104 요리 주점 → 12 기타
 */
export function categoryIdOfIndustry(smallCode: string): number {
  return BY_SMALL[smallCode] ?? BY_MIDDLE[smallCode.slice(0, 4)] ?? CategoryId.ETC;
}

/** 카테고리 id를 확인한다. 없으면 400 INVALID_CATEGORY */
export async function requireCategory(categoryId: number) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true },
  });
  if (!category) throw new AppError(RestaurantError.INVALID_CATEGORY);
  return category;
}
