import { MemberStatus } from '../../common/auth/member-status';
import { randomDigits, randomToken } from '../../common/crypto';
import { AppError } from '../../common/errors/app-error';
import type { ErrorCodeDef } from '../../common/errors/error-codes';
import { Prisma } from '../../generated/prisma/client';
import { sendMail } from '../../lib/mailer';
import { prisma } from '../../lib/prisma';
import { AccountError } from './auth.errors';
import type { SignupBody } from './auth.schema';
import { toAuthUser } from './auth-user';
import { saveConsents } from './consent.service';
import { verificationCodeMail } from './mail-templates';
import { hashSecret, verifySecret } from './password';
import { accessTokenBody, createRefreshToken } from './refresh-token';
import {
  consumeTemporaryToken,
  createTemporaryToken,
  findTemporaryToken,
  readPayload,
  tokenState,
} from './temporary-token';

/** 인증 코드 유효시간 5분, 재발송 간격 60초, 같은 이메일 1시간 5회, 틀릴 수 있는 횟수 5번 (초안 값) */
export const VERIFICATION_CODE_EXPIRES_IN = 300;
export const VERIFICATION_RESEND_INTERVAL = 60;
const VERIFICATION_HOURLY_LIMIT = 5;
const VERIFICATION_MAX_ATTEMPTS = 5;
/** 인증 완료 토큰 유효시간 30분 */
export const EMAIL_VERIFIED_EXPIRES_IN = 1800;

const PROVIDER_NAME: Record<string, string> = { K: '카카오', G: '구글' };

interface EmailVerifyPayload {
  email: string;
  codeHash: string;
  attempts: number;
}

interface EmailVerifiedPayload {
  email: string;
}

type EmailOwner =
  | { reason: 'EMAIL_ALREADY_EXISTS'; provider: null }
  | { reason: 'SOCIAL_ACCOUNT_EXISTS'; provider: string };

/** 이메일을 이미 쓰는 계정이 있는지 (탈퇴 회원 제외). 이메일 계정이 소셜보다 먼저 */
async function findEmailOwner(email: string): Promise<EmailOwner | null> {
  const member = await prisma.member.findFirst({
    where: { email, status: { not: MemberStatus.WITHDRAWN } },
    select: { id: true },
  });
  if (member) return { reason: 'EMAIL_ALREADY_EXISTS', provider: null };

  const social = await prisma.socialAccount.findFirst({
    where: { email, user: { status: { not: MemberStatus.WITHDRAWN } } },
    orderBy: { id: 'asc' },
    select: { provider: true },
  });
  if (social) return { reason: 'SOCIAL_ACCOUNT_EXISTS', provider: social.provider };
  return null;
}

function ownerError(owner: EmailOwner) {
  if (owner.reason === 'EMAIL_ALREADY_EXISTS') {
    return new AppError(AccountError.EMAIL_ALREADY_EXISTS);
  }
  const name = PROVIDER_NAME[owner.provider] ?? '소셜 계정';
  return new AppError(AccountError.SOCIAL_ACCOUNT_EXISTS, `${name}로 가입한 이메일이에요.`);
}

/** AUTH-01 이메일 중복 확인 */
export async function checkEmailAvailability(email: string) {
  const owner = await findEmailOwner(email);
  if (!owner) {
    return {
      data: { email, available: true, reason: null, provider: null },
      message: '사용할 수 있는 이메일이에요.',
    };
  }
  if (owner.reason === 'EMAIL_ALREADY_EXISTS') {
    return {
      data: { email, available: false, reason: owner.reason, provider: null },
      message: '이미 가입한 이메일이에요. 로그인해 주세요.',
    };
  }
  const name = PROVIDER_NAME[owner.provider] ?? '소셜 계정';
  return {
    data: { email, available: false, reason: owner.reason, provider: owner.provider },
    message: `${name}로 가입한 이메일이에요. ${name}로 로그인해 주세요.`,
  };
}

/** AUTH-02 이메일 인증 코드 발송 (재발송 포함) */
export async function sendVerificationCode(email: string, now = new Date()) {
  const owner = await findEmailOwner(email);
  if (owner) throw ownerError(owner);

  // 같은 이메일의 최근 1시간 발송 기록으로 횟수를 센다.
  const recent = await prisma.authTemporaryToken.findMany({
    where: {
      tokenType: 'EMAIL_VERIFY',
      regDate: { gt: new Date(now.getTime() - 60 * 60 * 1000) },
      payload: { path: '$.email', equals: email },
    },
    orderBy: { regDate: 'desc' },
    select: { regDate: true },
  });
  if (recent.length >= VERIFICATION_HOURLY_LIMIT) {
    throw new AppError(AccountError.VERIFICATION_CODE_SEND_LIMIT);
  }
  const last = recent[0];
  if (last) {
    const waited = Math.floor((now.getTime() - last.regDate.getTime()) / 1000);
    const remain = VERIFICATION_RESEND_INTERVAL - waited;
    if (remain > 0) {
      throw new AppError(
        AccountError.VERIFICATION_CODE_RESEND_TOO_SOON,
        `${remain}초 후에 다시 보낼 수 있어요.`,
      );
    }
  }

  // 메일을 먼저 보내고, 보내졌을 때만 DB에 남긴다 (실패하면 이전 코드가 그대로 살아 있다).
  const code = randomDigits(6);
  try {
    await sendMail(verificationCodeMail(email, code));
  } catch (err) {
    console.error('인증 코드 메일 발송 실패', err);
    throw new AppError(AccountError.EMAIL_SEND_FAILED);
  }

  const payload: EmailVerifyPayload = { email, codeHash: await hashSecret(code), attempts: 0 };
  await prisma.$transaction(async (tx) => {
    await tx.authTemporaryToken.updateMany({
      where: {
        tokenType: 'EMAIL_VERIFY',
        usedAt: null,
        payload: { path: '$.email', equals: email },
      },
      data: { usedAt: now },
    });
    await createTemporaryToken(tx, {
      token: randomToken(),
      type: 'EMAIL_VERIFY',
      payload: { ...payload },
      expiresInSeconds: VERIFICATION_CODE_EXPIRES_IN,
      now,
    });
  });

  return {
    email,
    expiresIn: VERIFICATION_CODE_EXPIRES_IN,
    resendAvailableIn: VERIFICATION_RESEND_INTERVAL,
  };
}

type VerifyResult =
  | { kind: 'error'; error: ErrorCodeDef }
  | { kind: 'mismatch'; remainingAttempts: number }
  | { kind: 'ok'; emailVerificationToken: string };

/** AUTH-03 이메일 인증 코드 확인 → 회원가입용 emailVerificationToken 발급 */
export async function verifyEmailCode(email: string, code: string, now = new Date()) {
  const latest = await prisma.authTemporaryToken.findFirst({
    where: { tokenType: 'EMAIL_VERIFY', payload: { path: '$.email', equals: email } },
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  if (!latest) throw new AppError(AccountError.VERIFICATION_REQUEST_NOT_FOUND);

  // 같은 코드 요청이 동시에 여러 번 와도 시도 횟수를 하나씩 세도록 행을 잠그고 확인한다.
  // 틀린 횟수는 저장해야 하므로 트랜잭션 안에서는 던지지 않고 결과만 돌려준다.
  const result = await prisma.$transaction(async (tx): Promise<VerifyResult> => {
    await tx.$queryRaw`SELECT id FROM auth_temporary_token WHERE id = ${latest.id} FOR UPDATE`;
    const row = await tx.authTemporaryToken.findUniqueOrThrow({ where: { id: latest.id } });
    const payload = readPayload<EmailVerifyPayload>(row);
    const state = tokenState(row, now);
    if (state === 'used') {
      return {
        kind: 'error',
        error:
          payload.attempts >= VERIFICATION_MAX_ATTEMPTS
            ? AccountError.VERIFICATION_ATTEMPTS_EXCEEDED
            : AccountError.VERIFICATION_REQUEST_NOT_FOUND,
      };
    }
    if (state === 'expired')
      return { kind: 'error', error: AccountError.VERIFICATION_CODE_EXPIRED };

    if (!(await verifySecret(code, payload.codeHash))) {
      const attempts = payload.attempts + 1;
      const exceeded = attempts >= VERIFICATION_MAX_ATTEMPTS;
      await tx.authTemporaryToken.update({
        where: { id: row.id },
        data: { payload: { ...payload, attempts }, usedAt: exceeded ? now : undefined },
      });
      return exceeded
        ? { kind: 'error', error: AccountError.VERIFICATION_ATTEMPTS_EXCEEDED }
        : { kind: 'mismatch', remainingAttempts: VERIFICATION_MAX_ATTEMPTS - attempts };
    }

    await tx.authTemporaryToken.update({ where: { id: row.id }, data: { usedAt: now } });
    const emailVerificationToken = randomToken();
    const verified: EmailVerifiedPayload = { email };
    await createTemporaryToken(tx, {
      token: emailVerificationToken,
      type: 'EMAIL_VERIFIED',
      payload: { ...verified },
      expiresInSeconds: EMAIL_VERIFIED_EXPIRES_IN,
      now,
    });
    return { kind: 'ok', emailVerificationToken };
  });

  if (result.kind === 'error') throw new AppError(result.error);
  if (result.kind === 'mismatch') {
    const { remainingAttempts } = result;
    throw new AppError(
      AccountError.VERIFICATION_CODE_MISMATCH,
      `인증 코드가 맞지 않아요. (${remainingAttempts}번 남았어요)`,
      { remainingAttempts },
    );
  }
  return {
    emailVerificationToken: result.emailVerificationToken,
    expiresIn: EMAIL_VERIFIED_EXPIRES_IN,
  };
}

/** AUTH-04 이메일 회원가입 → status P 회원 + 약관 동의 + 로그인 */
export async function signupWithEmail(body: SignupBody, now = new Date()) {
  const tokenRow = await findTemporaryToken(prisma, body.emailVerificationToken, 'EMAIL_VERIFIED');
  if (!tokenRow) throw new AppError(AccountError.EMAIL_VERIFICATION_TOKEN_INVALID);
  const state = tokenState(tokenRow, now);
  if (state === 'used') throw new AppError(AccountError.EMAIL_VERIFICATION_TOKEN_INVALID);
  if (state === 'expired') throw new AppError(AccountError.EMAIL_VERIFICATION_TOKEN_EXPIRED);
  if (readPayload<EmailVerifiedPayload>(tokenRow).email !== body.email) {
    throw new AppError(AccountError.EMAIL_VERIFICATION_MISMATCH);
  }

  const owner = await findEmailOwner(body.email);
  if (owner) throw ownerError(owner);

  const passwordHash = await hashSecret(body.password);

  try {
    return await prisma.$transaction(async (tx) => {
      if (!(await consumeTemporaryToken(tx, tokenRow.id, now))) {
        throw new AppError(AccountError.EMAIL_VERIFICATION_TOKEN_INVALID);
      }
      const member = await tx.member.create({
        data: {
          email: body.email,
          password: passwordHash,
          status: MemberStatus.PENDING,
          marketingAlarm: body.consents.marketing,
          regDate: now,
        },
      });
      await saveConsents(tx, member.id, body.consents, now);
      const refreshToken = await createRefreshToken(tx, member.id, now);

      return {
        refreshToken,
        data: {
          ...accessTokenBody(member.id),
          nextAction: 'PROFILE_REQUIRED' as const,
          user: toAuthUser(member),
        },
      };
    });
  } catch (err) {
    // 동시에 같은 이메일로 가입하면 email unique 제약에 걸린다.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(AccountError.EMAIL_ALREADY_EXISTS);
    }
    throw err;
  }
}
