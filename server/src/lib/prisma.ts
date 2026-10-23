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
});

export const prisma = new PrismaClient({ adapter });
