import { MemberStatus } from '../../common/auth/member-status';
import { randomToken } from '../../common/crypto';
import { AppError } from '../../common/errors/app-error';
import { AuthError } from '../../common/errors/error-codes';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { AccountError } from './auth.errors';
import { nextActionFor, toAuthUser } from './auth-user';
import type { KakaoProfile } from './oauth/providers';
import { accessTokenBody, createRefreshToken } from './refresh-token';
import {
  consumeTemporaryToken,
  createTemporaryToken,
  findTemporaryToken,
  readPayload,
  tokenState,
} from './temporary-token';

/** 콜백 결과 교환 코드 1분 */
export const OAUTH_RESULT_EXPIRES_IN = 60;

interface OAuthResultPayload {
  kakaoId: string;
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** AUTH-07: 카카오 회원번호를 1분짜리 일회용 코드로 바꿔 둔다 (토큰은 URL에 노출하지 않음) */
export async function createOAuthResultCode(profile: KakaoProfile) {
  const code = randomToken();
  const payload: OAuthResultPayload = { kakaoId: profile.kakaoId };
  await createTemporaryToken(prisma, {
    token: code,
    type: 'OAUTH_RESULT',
    payload: { ...payload },
    expiresInSeconds: OAUTH_RESULT_EXPIRES_IN,
  });
  return code;
}

/** 이미 가입한 카카오 계정으로 로그인 (①): 마지막 로그인 시각을 남기고 토큰을 발급한다 */
async function loginExisting(memberId: bigint, now: Date) {
  const { member, refreshToken } = await prisma.$transaction(async (tx) => {
    const updated = await tx.member.update({
      where: { id: memberId },
      data: { lastLoginAt: now },
    });
    return { member: updated, refreshToken: await createRefreshToken(tx, updated.id, now) };
  });
  return {
    refreshToken,
    message: '로그인했어요.',
    data: {
      nextAction: await nextActionFor(member),
      isNewUser: false,
      ...accessTokenBody(member.id),
      user: toAuthUser(member),
    },
  };
}

/**
 * AUTH-08 카카오 로그인 결과 교환
 * ① 이미 가입한 카카오 계정 → 로그인
 * ② 처음 온 카카오 계정 → 회원(status P)을 만들고 로그인, TERMS_REQUIRED
 * 탈퇴하면 kakao_id를 비우므로 탈퇴한 사람이 다시 오면 ②로 새로 가입한다.
 */
export async function exchangeOAuthResult(oauthResultCode: string, now = new Date()) {
  const row = await findTemporaryToken(prisma, oauthResultCode, 'OAUTH_RESULT');
  if (!row) throw new AppError(AccountError.OAUTH_RESULT_CODE_INVALID);
  const state = tokenState(row, now);
  if (state === 'used') throw new AppError(AccountError.OAUTH_RESULT_CODE_INVALID);
  if (state === 'expired') throw new AppError(AccountError.OAUTH_RESULT_CODE_EXPIRED);
  if (!(await consumeTemporaryToken(prisma, row.id, now))) {
    throw new AppError(AccountError.OAUTH_RESULT_CODE_INVALID);
  }
  const { kakaoId } = readPayload<OAuthResultPayload>(row);

  // ① 이미 가입한 카카오 계정
  const existing = await prisma.member.findUnique({
    where: { kakaoId },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status === MemberStatus.SUSPENDED) throw new AppError(AuthError.MEMBER_SUSPENDED);
    return loginExisting(existing.id, now);
  }

  // ② 신규 가입
  let created: { memberId: bigint; refreshToken: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      const member = await tx.member.create({
        data: { kakaoId, status: MemberStatus.PENDING, lastLoginAt: now, regDate: now },
      });
      return { memberId: member.id, refreshToken: await createRefreshToken(tx, member.id, now) };
    });
  } catch (err) {
    // 같은 카카오 계정으로 동시에 들어와 한쪽이 먼저 가입했으면 그 회원으로 로그인한다.
    if (!isUniqueViolation(err)) throw err;
    const winner = await prisma.member.findUnique({ where: { kakaoId }, select: { id: true } });
    if (!winner) throw err;
    return loginExisting(winner.id, now);
  }

  const member = await prisma.member.findUniqueOrThrow({ where: { id: created.memberId } });
  return {
    refreshToken: created.refreshToken,
    message: '약관에 동의하고 프로필을 설정해 주세요.',
    data: {
      nextAction: 'TERMS_REQUIRED' as const,
      isNewUser: true,
      ...accessTokenBody(member.id),
      user: toAuthUser(member),
    },
  };
}
