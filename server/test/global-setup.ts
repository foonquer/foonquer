import { execFileSync } from 'node:child_process';
import path from 'node:path';
import * as mariadb from 'mariadb';
import { seedBaseData } from '../prisma/seed-data';
import { prisma } from '../src/lib/prisma';

/**
 * 테스트를 시작하기 전에 한 번 실행된다.
 * 1. 테스트 DB가 없으면 만든다.
 * 2. 마이그레이션을 적용한다 (prisma migrate deploy). SKIP_TEST_DB_MIGRATE=1이면 건너뛴다.
 * 3. 카테고리 같은 기본 데이터를 넣는다.
 */
export default async function setup() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const database = url.pathname.slice(1);

  // 실수로 개발 DB를 비우지 않도록 이름을 확인한다 (테스트는 매번 테이블을 비운다).
  if (!/^[A-Za-z0-9_]+_test$/.test(database)) {
    throw new Error(
      `테스트 DB 이름은 _test로 끝나야 합니다 (지금: "${database}"). TEST_DATABASE_URL을 확인하세요.`,
    );
  }

  const connection = await mariadb.createConnection({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    allowPublicKeyRetrieval: true,
  });
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
  } finally {
    await connection.end();
  }

  if (process.env.SKIP_TEST_DB_MIGRATE !== '1') {
    const serverRoot = path.resolve(__dirname, '..');
    const prismaCli = require.resolve('prisma/build/index.js', { paths: [serverRoot] });
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: serverRoot,
      env: process.env,
      stdio: 'inherit',
    });
  }

  try {
    await seedBaseData(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
