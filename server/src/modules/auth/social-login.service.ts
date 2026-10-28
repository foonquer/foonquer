import { MemberStatus } from '../../common/auth/member-status';
import { randomToken } from '../../common/crypto';
import { AppError } from '../../common/errors/app-error';
import { AuthError } from '../../common/errors/error-codes';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { AccountError } from './auth.errors';
import { maskEmail, nextActionFor, toAuthUser } from './auth-user';
import { PROVIDERS, providerByCode, type OAuthProfile, type ProviderSlug } from './oauth/providers';
import { accessTokenBody, createRefreshToken } from './refresh-token';
import {
  consumeTemporaryToken,
  createTemporaryToken,
  findTemporaryToken,
  readPayload,
  tokenState,
} from './temporary-token';

/** 콜백 결과 교환 코드 1분, 계정 연동 토큰 5분 */
export const OAUTH_RESULT_EXPIRES_IN = 60;
export const ACCOUNT_LINK_EXPIRES_IN = 300;

interface OAuthResultPayload {
  provider: string;
  providerId: string;
  email: string | null;
  emailVerified: boolean;
}

interface AccountLinkPayload {
  targetUserId: string;
  provider: string;
  providerId: string;
  email: string;
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** AUTH-07: 제공자 사용자 정보를 1분짜리 일회용 코드로 바꿔 둔다 (토큰은 URL에 노출하지 않음) */
export async function createOAuthResultCode(slug: ProviderSlug, profile: OAuthProfile) {
  const code = randomToken();
  const payload: OAuthResultPayload = {
    provider: PROVIDERS[slug].code,
    providerId: profile.providerId,
    email: profile.email,
    emailVerified: profile.emailVerified,
  };
  await createTemporaryToken(prisma, {
    token: code,
    type: 'OAUTH_RESULT',
    payload: { ...payload },
    expiresInSeconds: OAUTH_RESULT_EXPIRES_IN,
  });
  return code;
}

/** 회원이 쓰는 로그인 방식 목록 (EMAIL / KAKAO / GOOGLE) */
export async function loginMethodsOf(member: { id: bigint; password: string | null }) {
  const socials = await prisma.socialAccount.findMany({
    where: { userId: member.id },
    orderBy: { id: 'asc' },
    select: { provider: true },
  });
  const methods: string[] = member.password ? ['EMAIL'] : [];
  for (const { provider } of socials) {
    const info = providerByCode(provider);
    if (info) methods.push(info.loginMethod);
  }
  return methods;
}

/** 로그인 처리: 마지막 로그인 시각을 남기고 토큰을 발급한다 */
async function signIn(memberId: bigint, now: Date) {
  return prisma.$transaction(async (tx) => {
    const member = await tx.member.update({
      where: { id: memberId },
      data: { lastLoginAt: now },
    });
    const refreshToken = await createRefreshToken(tx, member.id, now);
    return { member, refreshToken };
  });
}

/** 같은 이메일을 쓰는 다른 계정 (탈퇴 제외). 이메일 로그인 계정이 먼저 */
async function findSameEmailMember(email: string) {
  const byEmail = await prisma.member.findFirst({
    where: { email, status: { not: MemberStatus.WITHDRAWN } },
  });
  if (byEmail) return byEmail;
  const social = await prisma.socialAccount.findFirst({
    where: { email, user: { status: { not: MemberStatus.WITHDRAWN } } },
    orderBy: { id: 'asc' },
    include: { user: true },
  });
  return social?.user ?? null;
}

/** 이미 연결된 소셜 계정으로 로그인 (①) */
async function loginExisting(memberId: bigint, now: Date) {
  const { member, refreshToken } = await signIn(memberId, now);
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
 * AUTH-08 소셜 로그인 결과 교환
 * ① 이미 연결된 소셜 계정 → 로그인
 * ② 처음 온 사람 → 회원(status P)과 소셜 계정을 만들고 로그인, TERMS_REQUIRED
 * ③ 제공자가 검증한 같은 이메일의 다른 계정이 있음 → 로그인하지 않고 ACCOUNT_LINK_REQUIRED
 * ④ 이메일이 없거나 미검증이면 연동 판단 없이 ②
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
  const profile = readPayload<OAuthResultPayload>(row);

  // ① 이미 연결된 소셜 계정
  const linked = await prisma.socialAccount.findUnique({
    where: { provider_providerId: { provider: profile.provider, providerId: profile.providerId } },
    include: { user: { select: { id: true, status: true } } },
  });
  if (linked) {
    if (linked.user.status === MemberStatus.SUSPENDED) {
      throw new AppError(AuthError.MEMBER_SUSPENDED);
    }
    if (linked.user.status !== MemberStatus.WITHDRAWN) return loginExisting(linked.user.id, now);
    // 탈퇴한 회원에 남아 있던 연결이면 지우고 새로 가입시킨다.
    await prisma.socialAccount.delete({ where: { id: linked.id } });
  }

  // ③ 같은 이메일의 다른 계정
  if (profile.emailVerified && profile.email) {
    const target = await findSameEmailMember(profile.email);
    if (target) {
      const accountLinkToken = randomToken();
      const payload: AccountLinkPayload = {
        targetUserId: target.id.toString(),
        provider: profile.provider,
        providerId: profile.providerId,
        email: profile.email,
      };
      await createTemporaryToken(prisma, {
        token: accountLinkToken,
        type: 'ACCOUNT_LINK',
        payload: { ...payload },
        expiresInSeconds: ACCOUNT_LINK_EXPIRES_IN,
        now,
      });
      return {
        refreshToken: null,
        message: '같은 이메일로 가입한 계정이 있어요. 계정을 연결할까요?',
        data: {
          nextAction: 'ACCOUNT_LINK_REQUIRED' as const,
          accountLinkToken,
          accountLinkTokenExpiresIn: ACCOUNT_LINK_EXPIRES_IN,
          provider: profile.provider,
          maskedEmail: maskEmail(profile.email),
          existingLoginMethods: await loginMethodsOf(target),
        },
      };
    }
  }

  // ② 신규 가입
  let created: { memberId: bigint; refreshToken: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      const member = await tx.member.create({
        data: { status: MemberStatus.PENDING, lastLoginAt: now, regDate: now },
      });
      await tx.socialAccount.create({
        data: {
          userId: member.id,
          provider: profile.provider,
          providerId: profile.providerId,
          // 제공자가 검증하지 않은 이메일은 저장하지 않는다. 저장하면 나중에 같은 이메일로 들어온
          // 다른 사람의 검증된 로그인이 이 회원을 계정 연동 대상으로 고를 수 있다.
          email: profile.emailVerified ? profile.email : null,
          regDate: now,
        },
      });
      return { memberId: member.id, refreshToken: await createRefreshToken(tx, member.id, now) };
    });
  } catch (err) {
    // 같은 소셜 계정으로 동시에 들어와 한쪽이 먼저 가입했으면 그 회원으로 로그인한다.
    if (!isUniqueViolation(err)) throw err;
    const existing = await prisma.socialAccount.findUnique({
      where: {
        provider_providerId: { provider: profile.provider, providerId: profile.providerId },
      },
    });
    if (!existing) throw err;
    return loginExisting(existing.userId, now);
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

/** AUTH-09 소셜 계정 연동: 같은 이메일의 기존 회원에 새 소셜 로그인을 붙이고 그 회원으로 로그인 */
export async function linkSocialAccount(accountLinkToken: string, now = new Date()) {
  const row = await findTemporaryToken(prisma, accountLinkToken, 'ACCOUNT_LINK');
  if (!row) throw new AppError(AccountError.ACCOUNT_LINK_TOKEN_INVALID);
  const state = tokenState(row, now);
  if (state === 'used') throw new AppError(AccountError.ACCOUNT_LINK_TOKEN_INVALID);
  if (state === 'expired') throw new AppError(AccountError.ACCOUNT_LINK_TOKEN_EXPIRED);
  if (!(await consumeTemporaryToken(prisma, row.id, now))) {
    throw new AppError(AccountError.ACCOUNT_LINK_TOKEN_INVALID);
  }
  const payload = readPayload<AccountLinkPayload>(row);
  const providerInfo = providerByCode(payload.provider);
  const providerName = providerInfo?.name ?? '소셜';

  const target = await prisma.member.findUnique({ where: { id: BigInt(payload.targetUserId) } });
  if (!target || target.status === MemberStatus.WITHDRAWN) {
    throw new AppError(AccountError.MEMBER_NOT_FOUND);
  }
  if (target.status === MemberStatus.SUSPENDED) throw new AppError(AuthError.MEMBER_SUSPENDED);

  const usedSocial = await prisma.socialAccount.findUnique({
    where: { provider_providerId: { provider: payload.provider, providerId: payload.providerId } },
  });
  if (usedSocial) throw new AppError(AccountError.SOCIAL_ACCOUNT_ALREADY_USED);
  const sameProvider = await prisma.socialAccount.findUnique({
    where: { userId_provider: { userId: target.id, provider: payload.provider } },
  });
  if (sameProvider) {
    throw new AppError(
      AccountError.PROVIDER_ALREADY_LINKED,
      `이 계정에는 이미 다른 ${providerName} 계정이 연결되어 있어요.`,
    );
  }

  try {
    await prisma.socialAccount.create({
      data: {
        userId: target.id,
        provider: payload.provider,
        providerId: payload.providerId,
        email: payload.email,
        regDate: now,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(AccountError.SOCIAL_ACCOUNT_ALREADY_USED);
    throw err;
  }

  const { member, refreshToken } = await signIn(target.id, now);
  return {
    refreshToken,
    message: `${providerName} 계정을 연결했어요.`,
    data: {
      nextAction: await nextActionFor(member),
      ...accessTokenBody(member.id),
      linkedProvider: payload.provider,
      user: toAuthUser(member),
    },
  };
}
