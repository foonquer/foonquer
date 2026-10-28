import { AppError } from '../../common/errors/app-error';
import { prisma } from '../../lib/prisma';
import { RestaurantError } from './restaurant.errors';

/**
 * 우리 카테고리 id (prisma/seed-data.ts와 같은 순서, 명세서 "주요 코드값 2. 음식점 카테고리").
 * 카카오 category_name을 이 12개로 바꿔 restaurant.category_id에 저장한다.
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

// 음식점 > {두 번째 단계} → 카테고리. 한식은 세 번째 단계(육류,고기 / 해물,생선)를 먼저 본다.
const BY_SECOND_LEVEL: Record<string, number> = {
  한식: CategoryId.KOREAN,
  중식: CategoryId.CHINESE,
  일식: CategoryId.JAPANESE,
  양식: CategoryId.WESTERN,
  분식: CategoryId.BUNSIK,
  치킨: CategoryId.CHICKEN,
  패스트푸드: CategoryId.FAST_FOOD,
  아시아음식: CategoryId.ASIAN,
  카페: CategoryId.CAFE_DESSERT,
  간식: CategoryId.CAFE_DESSERT,
};

const KOREAN_THIRD_LEVEL: Record<string, number> = {
  '육류,고기': CategoryId.MEAT,
  '해물,생선': CategoryId.SEAFOOD,
};

/**
 * 카카오 분류 → 우리 카테고리 id. 모든 가게는 카테고리가 있다(안 맞으면 기타).
 * 예) '음식점 > 한식 > 육류,고기 > 삼겹살' → 6 고깃집, 그룹 CE7 → 11 카페·디저트, '음식점 > 술집 > 호프' → 12 기타
 */
export function categoryIdOf(kakaoCategoryName: string, groupCode: string): number {
  if (groupCode === 'CE7') return CategoryId.CAFE_DESSERT;
  const [first, second, third] = kakaoCategoryName.split('>').map((s) => s.trim());
  if (first !== '음식점' || !second) return CategoryId.ETC;
  if (second === '한식' && third && KOREAN_THIRD_LEVEL[third]) return KOREAN_THIRD_LEVEL[third];
  return BY_SECOND_LEVEL[second] ?? CategoryId.ETC;
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
