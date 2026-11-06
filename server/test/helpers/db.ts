import { prisma } from '../../src/lib/prisma';
import { resetRateLimits } from '../../src/common/middlewares/rate-limit';

// global-setup.ts가 넣은 기본 데이터 테이블은 비우지 않는다.
const KEEP_TABLES = new Set([
  '_prisma_migrations',
  'category',
  'region',
  'policy_document',
  'rating_param',
  'level_policy',
  'reward_policy',
  'item',
  'item_recipe',
  'season_reward_rule',
  'achievement',
  'review_aspect',
  'item_set',
  'item_set_item',
]);

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

/**
 * 다른 연결 count개가 sqlPrefix로 시작하는 쿼리를 실행 중(잠금 대기 포함)일 때까지 기다린다.
 * 동시성 테스트에서 "요청이 잠금 앞에 도착했다"를 시간(sleep) 대신 이 신호로 확인한다 (테스트 파일은 하나씩 돈다)
 */
export async function waitForRunningQueries(sqlPrefix: string, count = 1, timeoutMs = 5_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const [row] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM information_schema.processlist
      WHERE db = DATABASE() AND id <> CONNECTION_ID() AND info LIKE CONCAT(${sqlPrefix}, '%')`;
    if (Number(row?.n ?? 0) >= count) return;
    if (Date.now() > until)
      throw new Error(`"${sqlPrefix}" 쿼리 ${count}개가 ${timeoutMs}ms 안에 실행되지 않았어요`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
