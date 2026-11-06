import { prisma } from '../src/lib/prisma';
import { seedBaseData } from './seed-data';

// 배포 때 deploy-remote.sh가 migrate deploy 다음에 실행한다. 데이터 목록은 seed-data.ts에 있다.

async function main() {
  const result = await seedBaseData(prisma);
  console.log(`seed: category ${result.categoryCount}개`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
