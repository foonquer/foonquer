import { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';

/** 트랜잭션 안팎 어디서나 받는 DB 클라이언트 */
export type Db = Prisma.TransactionClient | typeof prisma;
export type Tx = Prisma.TransactionClient;

/** unique 제약 위반(P2002)인지 */
export function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** 회원 행을 잠근다 (포인트·경험치·온도처럼 같은 회원 값을 동시에 바꾸는 곳에서 먼저 부른다) */
export async function lockMember(tx: Tx, userId: bigint) {
  await tx.$queryRaw`SELECT id FROM member WHERE id = ${userId} FOR UPDATE`;
}
