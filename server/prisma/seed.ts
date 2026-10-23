import { prisma } from '../src/lib/prisma';

// 바뀌지 않는 기본 데이터. 여러 번 실행해도 같은 결과가 되도록 upsert만 쓴다.
// 배포 때 deploy-remote.sh가 migrate deploy 다음에 실행한다.

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

async function main() {
  for (const [index, name] of categories.entries()) {
    const id = index + 1;
    await prisma.category.upsert({
      where: { id },
      update: { name, sortOrder: id },
      create: { id, name, sortOrder: id },
    });
  }
  console.log(`seed: category ${categories.length}개`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
