import { prisma } from '../lib/prisma';
import { JOBS, type JobName } from './jobs';

// 사용법: pnpm -C server job <rating|season|cleanup|saved-reminder|all>
// 운영 서버(VM)에서는 crontab으로 하루 1번 돌린다 (README "주기 작업")

async function main() {
  const name = process.argv[2] ?? '';
  const names = name === 'all' ? (Object.keys(JOBS) as JobName[]) : [name as JobName];
  if (!names.every((n) => n in JOBS)) {
    console.error(`작업 이름: ${Object.keys(JOBS).join(' | ')} | all`);
    process.exitCode = 1;
    return;
  }
  // 하나가 실패해도 나머지 작업(특히 season)은 돌리고, 끝에 종료 코드로 실패를 알린다
  for (const n of names) {
    const started = Date.now();
    try {
      const result: object = await JOBS[n]();
      console.log(`[job] ${n} ${Date.now() - started}ms`, JSON.stringify(result));
      if ('failed' in result && Number(result.failed) > 0) process.exitCode = 1;
    } catch (err) {
      console.error(`[job] ${n} 실패`, err);
      process.exitCode = 1;
    }
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
