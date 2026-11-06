import { MemberStatus } from '../../common/auth/member-status';
import { sha256Hex } from '../../common/crypto';
import { AppError } from '../../common/errors/app-error';
import { AuthError } from '../../common/errors/error-codes';
import { prisma } from '../../lib/prisma';
import { AccountError } from './auth.errors';
import { nextActionFor } from './auth-user';
import {
  accessTokenBody,
  createRefreshToken,
  revokeAllRefreshTokens,
  revokeRefreshTokenByHash,
  wasRotated,
} from './refresh-token';

/**
 * AUTH-10 토큰 재발급. refreshToken을 확인하고 새 accessToken과 새 refreshToken을 준다(회전).
 * 이미 폐기된 refreshToken이 다시 오면 탈취로 보고 그 회원의 refreshToken을 모두 폐기한다.
 */
export async function refreshSession(refreshToken: string | null, now = new Date()) {
  if (!refreshToken) throw new AppError(AccountError.REFRESH_TOKEN_REQUIRED);

  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256Hex(refreshToken) },
  });
  if (!row) throw new AppError(AccountError.REFRESH_TOKEN_INVALID);
  if (row.revokedAt) {
    if (wasRotated(row)) await revokeAllRefreshTokens(prisma, row.userId, now);
    throw new AppError(AccountError.REFRESH_TOKEN_INVALID);
  }
  if (row.expiresAt <= now) throw new AppError(AccountError.REFRESH_TOKEN_EXPIRED);

  const member = await prisma.member.findUnique({
    where: { id: row.userId },
    select: { id: true, status: true },
  });
  if (!member || member.status === MemberStatus.WITHDRAWN) {
    throw new AppError(AccountError.MEMBER_WITHDRAWN);
  }
  if (member.status === MemberStatus.SUSPENDED) throw new AppError(AuthError.MEMBER_SUSPENDED);

  const newRefreshToken = await prisma.$transaction(async (tx) => {
    // 같은 토큰으로 동시에 두 번 재발급하면 한쪽만 성공한다. 진 쪽은 재사용으로 본다.
    const revoked = await tx.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (revoked.count !== 1) return null;
    return createRefreshToken(tx, member.id, now);
  });
  if (!newRefreshToken) {
    await revokeAllRefreshTokens(prisma, member.id, now);
    throw new AppError(AccountError.REFRESH_TOKEN_INVALID);
  }

  return {
    refreshToken: newRefreshToken,
    data: { ...accessTokenBody(member.id), nextAction: await nextActionFor(member) },
  };
}

/** AUTH-11 로그아웃. 이 기기의 refreshToken만 폐기한다. 없거나 이미 폐기됐어도 성공(멱등) */
export async function logout(refreshToken: string | null, now = new Date()) {
  if (!refreshToken) return;
  await revokeRefreshTokenByHash(prisma, sha256Hex(refreshToken), now);
}
