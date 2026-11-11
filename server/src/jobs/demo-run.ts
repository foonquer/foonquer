import { prisma } from '../lib/prisma';
import { clearDemoData, seedDemoData, seedDemoReviews } from './demo-data';

// 사용법 (닉네임은 가짜 정복 기록을 같이 받을 내 계정):
//   개발: pnpm -C server demo <seed|reviews|clear> <내 닉네임>
//   운영: docker compose exec -T app node dist/src/jobs/demo-run.js <seed|reviews|clear> <내 닉네임>
//   reviews는 seed 다음에 (가짜 리뷰·내 동네 가짜 방문), clear는 리뷰까지 지운다

async function main() {
  const [command, nickname] = process.argv.slice(2);
  const run = { seed: seedDemoData, reviews: seedDemoReviews, clear: clearDemoData }[command];
  if (!nickname || !run) {
    console.error('사용법: demo-run <seed|reviews|clear> <내 닉네임>');
    process.exitCode = 1;
    return;
  }
  const result = await run(nickname);
  console.log(`[demo-data] ${command}`, JSON.stringify(result));
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
