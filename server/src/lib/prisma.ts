import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { env } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';

// Prisma CLI(migrate)는 mysql:// 주소를 쓰고, mariadb 드라이버는 mariadb:// 주소만 받아서
// 같은 DATABASE_URL을 풀어서 넘긴다.
const url = new URL(env.DATABASE_URL);

const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: url.port ? Number(url.port) : 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  connectionLimit: 10,
  // MySQL 8 기본 인증(caching_sha2_password)을 SSL 없이 쓸 때 필요하다.
  allowPublicKeyRetrieval: true,
  // 기본 REPEATABLE READ는 트랜잭션 첫 조회 때 찍은 스냅샷을 계속 읽어서, 회원 행을 잠근 뒤에도
  // 먼저 끝난 트랜잭션의 포인트·경험치 내역을 못 본다(하루 한도 초과, 경험치 덮어쓰기). 잠근 뒤 최신 값을 읽도록 READ COMMITTED로 연다.
  initSql: 'SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED',
});

export const prisma = new PrismaClient({ adapter });
