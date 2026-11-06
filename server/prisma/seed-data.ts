import type { PrismaClient } from '../src/generated/prisma/client';

// 바뀌지 않는 기본 데이터. 여러 번 실행해도 같은 결과가 되도록 upsert만 쓴다.
// prisma/seed.ts(배포·로컬)와 테스트 준비(test/global-setup.ts)가 같이 쓴다.

// ERD category 노트의 id 순서 = 검색 홈 칩 순서 (2026-10-08 12개 확정)
const categories = [
  '한식',
  '중식',
  '일식',
  '양식',
  '분식',
  '고깃집',
  '해산물',
  '치킨',
  '패스트푸드',
  '아시안',
  '카페·디저트',
  '기타',
];

async function seedCategories(prisma: PrismaClient) {
  for (const [index, name] of categories.entries()) {
    const id = index + 1;
    await prisma.category.upsert({
      where: { id },
      update: { name, sortOrder: id },
      create: { id, name, sortOrder: id },
    });
  }
  return categories.length;
}

/** 기본 데이터를 모두 넣고 넣은 개수를 돌려준다 */
export async function seedBaseData(prisma: PrismaClient) {
  const categoryCount = await seedCategories(prisma);
  return { categoryCount };
}
