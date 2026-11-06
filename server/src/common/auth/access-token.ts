import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from '../errors/app-error';
import { AuthError } from '../errors/error-codes';

/** accessToken 유효시간(초). 명세서: 1시간 */
export const ACCESS_TOKEN_EXPIRES_IN = 3600;

const ALGORITHM = 'HS256';

interface AccessTokenPayload {
  typ: 'access';
}

/** 회원 id로 accessToken(JWT)을 만든다. sub = 회원 id */
export function signAccessToken(userId: bigint): string {
  const payload: AccessTokenPayload = { typ: 'access' };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: ALGORITHM,
    subject: userId.toString(),
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

/**
 * accessToken을 확인하고 회원 id를 돌려준다.
 * 만료면 TOKEN_EXPIRED(프론트가 재발급을 시도), 그 밖의 문제는 TOKEN_INVALID.
 */
export function verifyAccessToken(token: string): bigint {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [ALGORITHM] });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new AppError(AuthError.TOKEN_EXPIRED);
    throw new AppError(AuthError.TOKEN_INVALID);
  }

  if (typeof decoded === 'string' || decoded.typ !== 'access' || !decoded.sub) {
    throw new AppError(AuthError.TOKEN_INVALID);
  }
  if (!/^[1-9]\d*$/.test(decoded.sub)) throw new AppError(AuthError.TOKEN_INVALID);
  return BigInt(decoded.sub);
}
