import { prisma } from '../lib/prisma';
import { clearDemoData, seedDemoData } from './demo-data';

// 사용법 (닉네임은 가짜 정복 기록을 같이 받을 내 계정):
//   개발: pnpm -C server demo <seed|clear> <내 닉네임>
//   운영: docker compose exec -T app node dist/src/jobs/demo-run.js <seed|clear> <내 닉네임>

async function main() {
  const [command, nickname] = process.argv.slice(2);
  if (!nickname || (command !== 'seed' && command !== 'clear')) {
    console.error('사용법: demo-run <seed|clear> <내 닉네임>');
    process.exitCode = 1;
    return;
  }
  const result = command === 'seed' ? await seedDemoData(nickname) : await clearDemoData(nickname);
  console.log(`[demo-data] ${command}`, JSON.stringify(result));
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
