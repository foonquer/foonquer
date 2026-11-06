import type { Request, RequestHandler } from 'express';
import { prisma } from '../../lib/prisma';
import { AppError } from '../errors/app-error';
import { AuthError } from '../errors/error-codes';
import { verifyAccessToken } from './access-token';
import { hasRequiredConsents } from './consent';
import { MemberStatus, type MemberStatusCode } from './member-status';

/**
 * 어느 단계 회원까지 들어올 수 있는지 (명세서 "회원 상태별 접근")
 * - 'terms'   : 약관 동의 전 소셜 신규 회원(status P)부터. 예) AUTH-15 약관 동의, USER-04 내 프로필
 * - 'profile' : 약관 동의를 마친 프로필 설정 전 회원(status P)부터. 예) USER-01·03, REGION-01·02
 * - 'active'  : 활성 회원(status A)만. 기본값
 */
export type AuthLevel = 'terms' | 'profile' | 'active';

export interface AuthUser {
  userId: bigint;
  status: MemberStatusCode;
}

function readBearerToken(req: Request): string {
  const header = req.headers.authorization;
  if (!header) throw new AppError(AuthError.TOKEN_REQUIRED);

  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer' || rest.length > 0) {
    throw new AppError(AuthError.TOKEN_INVALID);
  }
  if (!token) throw new AppError(AuthError.TOKEN_REQUIRED);
  return token;
}

/**
 * accessToken을 확인하고 req.auth에 회원 id와 상태를 넣는다.
 * 예) router.get('/me', requireAuth('terms'), handler)
 *
 * - 토큰 없음 401 TOKEN_REQUIRED / 위조·형식 오류 401 TOKEN_INVALID / 만료 401 TOKEN_EXPIRED
 * - 탈퇴한 회원의 토큰 401 TOKEN_INVALID, 이용 정지 403 MEMBER_SUSPENDED
 * - 가입 절차가 남은 회원(status P)은 level에 따라 403 TERMS_REQUIRED / PROFILE_REQUIRED
 */
export function requireAuth(level: AuthLevel = 'active'): RequestHandler {
  return async (req, _res, next) => {
    const userId = verifyAccessToken(readBearerToken(req));

    const member = await prisma.member.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!member || member.status === MemberStatus.WITHDRAWN) {
      throw new AppError(AuthError.TOKEN_INVALID);
    }
    if (member.status === MemberStatus.SUSPENDED) throw new AppError(AuthError.MEMBER_SUSPENDED);

    if (member.status === MemberStatus.PENDING && level !== 'terms') {
      if (!(await hasRequiredConsents(member.id))) throw new AppError(AuthError.TERMS_REQUIRED);
      if (level === 'active') throw new AppError(AuthError.PROFILE_REQUIRED);
    }

    req.auth = { userId: member.id, status: member.status as MemberStatusCode };
    next();
  };
}

/** requireAuth()를 거친 라우트에서 로그인한 회원 id를 꺼낸다 */
export function getAuthUser(req: Request): AuthUser {
  if (!req.auth) throw new AppError(AuthError.TOKEN_REQUIRED);
  return req.auth;
}
