import type { CookieOptions, Request, Response } from 'express';
import { ACCESS_TOKEN_EXPIRES_IN, signAccessToken } from '../../common/auth/access-token';
import { randomToken, sha256Hex } from '../../common/crypto';
import { addSeconds } from '../../common/time';
import { env } from '../../config/env';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';

/** refreshToken 유효시간(초). 명세서: 14일 */
export const REFRESH_TOKEN_EXPIRES_IN = 14 * 24 * 60 * 60;
export const REFRESH_COOKIE_NAME = 'refreshToken';
/** 쿠키가 /api/v1/auth 아래 요청에만 실리게 한다 (재발급·로그아웃) */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

type Db = Prisma.TransactionClient | typeof prisma;

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...cookieOptions(),
    maxAge: REFRESH_TOKEN_EXPIRES_IN * 1000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.cookie(REFRESH_COOKIE_NAME, '', { ...cookieOptions(), maxAge: 0 });
}

export function readRefreshCookie(req: Request): string | null {
  const value: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** 새 refreshToken을 만들어 해시를 저장하고 원문을 돌려준다 (쿠키에 넣을 값) */
export async function createRefreshToken(db: Db, userId: bigint, now = new Date()) {
  const token = randomToken();
  await db.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256Hex(token),
      expiresAt: addSeconds(now, REFRESH_TOKEN_EXPIRES_IN),
      regDate: now,
    },
  });
  return token;
}

/*
 * 폐기 방식 두 가지 (refresh_token에 폐기 이유 컬럼이 없어서 expires_at으로 구분한다)
 * - 재발급(회전)으로 바뀐 토큰: revoked_at만 채운다 (expires_at은 원래대로 미래).
 *   이런 토큰이 다시 오면 탈취로 보고 그 회원의 토큰을 모두 폐기한다 (AUTH-10).
 * - 로그아웃·비밀번호 변경처럼 일부러 끝낸 토큰: revoked_at과 expires_at을 같이 지금으로.
 *   다른 기기에 남은 이런 토큰이 다시 와도 탈취로 보지 않는다. 그렇지 않으면 비밀번호를 바꾼 뒤
 *   다른 기기가 재발급을 시도하는 순간 방금 받은 새 토큰까지 폐기되어 버린다.
 */

/** 그 회원의 살아 있는 refreshToken을 모두 끝낸다 (모든 기기 로그아웃) */
export function revokeAllRefreshTokens(db: Db, userId: bigint, now = new Date()) {
  return db.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now, expiresAt: now },
  });
}

/** 이 토큰 하나만 끝낸다 (로그아웃) */
export function revokeRefreshTokenByHash(db: Db, tokenHash: string, now = new Date()) {
  return db.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: now, expiresAt: now },
  });
}

/** 재발급(회전)으로 바뀌어 폐기된 토큰인지 — 다시 오면 탈취로 본다 */
export function wasRotated(row: { revokedAt: Date | null; expiresAt: Date }) {
  return row.revokedAt !== null && row.expiresAt.getTime() > row.revokedAt.getTime();
}

/** 응답 data에 넣는 accessToken 묶음 */
export function accessTokenBody(userId: bigint) {
  return {
    accessToken: signAccessToken(userId),
    tokenType: 'Bearer' as const,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  };
}
