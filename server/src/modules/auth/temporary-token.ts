import { sha256Hex } from '../../common/crypto';
import { addSeconds } from '../../common/time';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * auth_temporary_token.token_type (ERD v0.9 — 로그인은 카카오 하나만)
 * - OAUTH_RESULT   카카오 로그인 콜백 결과 교환 코드 (1분)  payload { kakaoId }
 */
export type TemporaryTokenType = 'OAUTH_RESULT';

type Db = Prisma.TransactionClient | typeof prisma;

export async function createTemporaryToken(
  db: Db,
  {
    token,
    type,
    payload,
    expiresInSeconds,
    now = new Date(),
  }: {
    token: string;
    type: TemporaryTokenType;
    payload: Prisma.InputJsonObject;
    expiresInSeconds: number;
    now?: Date;
  },
) {
  return db.authTemporaryToken.create({
    data: {
      tokenHash: sha256Hex(token),
      tokenType: type,
      payload,
      expiresAt: addSeconds(now, expiresInSeconds),
      regDate: now,
    },
  });
}

/** 토큰 원문으로 같은 종류의 행을 찾는다 (사용 여부·만료와 상관없이) */
export function findTemporaryToken(db: Db, token: string, type: TemporaryTokenType) {
  return db.authTemporaryToken.findFirst({
    where: { tokenHash: sha256Hex(token), tokenType: type },
  });
}

/**
 * 아직 안 쓴 토큰이면 used_at을 채워 소비한다. 동시에 두 번 써도 한 번만 성공하도록 조건부로 바꾼다.
 * @returns 이번 호출에서 소비했으면 true
 */
export async function consumeTemporaryToken(db: Db, id: bigint, now = new Date()) {
  const result = await db.authTemporaryToken.updateMany({
    where: { id, usedAt: null },
    data: { usedAt: now },
  });
  return result.count === 1;
}

export type TokenState = 'valid' | 'used' | 'expired';

export function tokenState(row: { usedAt: Date | null; expiresAt: Date }, now = new Date()) {
  if (row.usedAt) return 'used' as const;
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired' as const;
  return 'valid' as const;
}

/** payload를 객체로 읽는다 (JSON 컬럼) */
export function readPayload<T>(row: { payload: Prisma.JsonValue }): T {
  return row.payload as unknown as T;
}
