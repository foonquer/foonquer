import { prisma } from '../../src/lib/prisma';
import { resetRateLimits } from '../../src/common/middlewares/rate-limit';

// global-setup.ts가 넣은 기본 데이터 테이블은 비우지 않는다.
const KEEP_TABLES = new Set(['_prisma_migrations', 'category', 'region']);

let tableNames: string[] | null = null;

async function loadTableNames() {
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`;
  return rows.map((r) => r.name).filter((name) => !KEEP_TABLES.has(name));
}

/** 테스트 사이에 DB를 비우고 요청 횟수 제한 기록도 지운다. beforeEach에서 부른다. */
export async function resetDb() {
  tableNames ??= await loadTableNames();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    try {
      for (const name of tableNames ?? []) {
        await tx.$executeRawUnsafe(`DELETE FROM \`${name}\``);
      }
    } finally {
      // 지우다 실패해도 이 연결을 다시 쓰는 다음 테스트가 외래 키 검사 없이 돌지 않게 되돌린다.
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
    }
  });
  await resetRateLimits();
}
