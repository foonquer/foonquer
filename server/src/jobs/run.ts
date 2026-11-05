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
  for (const n of names) {
    const started = Date.now();
    const result = await JOBS[n]();
    console.log(`[job] ${n} ${Date.now() - started}ms`, JSON.stringify(result));
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
