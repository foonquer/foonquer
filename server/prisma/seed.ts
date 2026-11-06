import { prisma } from '../src/lib/prisma';
import { seedBaseData, seedSeasons } from './seed-data';

// 배포 때 deploy-remote.sh가 migrate deploy 다음에 실행한다. 데이터 목록은 seed-data.ts에 있다.

async function main() {
  const result = await seedBaseData(prisma);
  const seasonCount = await seedSeasons(prisma);
  console.log(
    `seed: category ${result.categoryCount}개, policy_document 새로 ${result.policyDocumentCreated}개, ` +
      `region 서울 구 ${result.sigunguCount}개·동 ${result.dongCount}개, ` +
      `아이템 ${result.itemCount}개, 세트 ${result.itemSetCount}개, 업적 ${result.achievementCount}개, 시즌 ${seasonCount}개`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
