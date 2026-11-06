import { sha256Hex } from '../../common/crypto';
import { addSeconds } from '../../common/time';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * auth_temporary_token.token_type (ERD v0.7)
 * - EMAIL_VERIFY   이메일 인증 코드 (5분)        payload { email, codeHash, attempts }
 * - EMAIL_VERIFIED 인증 완료 토큰, 가입에 사용 (30분) payload { email }
 * - PASSWORD_RESET 비밀번호 재설정 링크 (30분)    payload { userId }
 * - OAUTH_RESULT   소셜 콜백 결과 교환 코드 (1분)  payload { provider, providerId, email, emailVerified }
 * - ACCOUNT_LINK   같은 이메일 계정 연동 (5분)     payload { targetUserId, provider, providerId, email }
 */
export type TemporaryTokenType =
  'EMAIL_VERIFY' | 'EMAIL_VERIFIED' | 'PASSWORD_RESET' | 'OAUTH_RESULT' | 'ACCOUNT_LINK';

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
