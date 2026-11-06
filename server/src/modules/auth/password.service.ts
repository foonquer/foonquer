import { ACCESS_TOKEN_EXPIRES_IN } from '../../common/auth/access-token';
import { MemberStatus } from '../../common/auth/member-status';
import { randomToken } from '../../common/crypto';
import { AppError } from '../../common/errors/app-error';
import { RecentEvents } from '../../common/recent-events';
import { toKstIso } from '../../common/time';
import { env } from '../../config/env';
import { sendMail } from '../../lib/mailer';
import { prisma } from '../../lib/prisma';
import { AccountError } from './auth.errors';
import { maskEmail } from './auth-user';
import { passwordResetMail } from './mail-templates';
import { hashSecret, verifySecret } from './password';
import { accessTokenBody, createRefreshToken, revokeAllRefreshTokens } from './refresh-token';
import {
  consumeTemporaryToken,
  createTemporaryToken,
  findTemporaryToken,
  readPayload,
  tokenState,
} from './temporary-token';

/** 재설정 링크 유효시간 30분, 다시 보내기 60초, 같은 이메일 1시간 5회 */
export const PASSWORD_RESET_EXPIRES_IN = 1800;
export const PASSWORD_RESET_RESEND_INTERVAL = 60;
const PASSWORD_RESET_HOURLY_LIMIT = 5;

const HOUR_MS = 60 * 60 * 1000;

// 가입 여부와 상관없이 같은 기준으로 세야 응답으로 가입 여부를 알 수 없으므로 DB가 아니라 이메일별로 메모리에서 센다.
const resetMailRequests = new RecentEvents(HOUR_MS);

interface PasswordResetPayload {
  userId: string;
}

/** AUTH-12 비밀번호 재설정 메일 발송. 가입하지 않은 이메일에도 같은 성공 응답을 준다 */
export async function sendPasswordResetMail(email: string, now = new Date()) {
  const nowMs = now.getTime();
  if (resetMailRequests.count(email, HOUR_MS, nowMs) >= PASSWORD_RESET_HOURLY_LIMIT) {
    throw new AppError(AccountError.PASSWORD_RESET_SEND_LIMIT);
  }
  const last = resetMailRequests.latest(email, nowMs);
  if (last !== null) {
    const remain = PASSWORD_RESET_RESEND_INTERVAL - Math.floor((nowMs - last) / 1000);
    if (remain > 0) {
      throw new AppError(
        AccountError.PASSWORD_RESET_RESEND_TOO_SOON,
        `${remain}초 후에 다시 보낼 수 있어요.`,
      );
    }
  }

  const member = await prisma.member.findFirst({
    where: {
      email,
      password: { not: null },
      status: { in: [MemberStatus.PENDING, MemberStatus.ACTIVE] },
    },
    select: { id: true },
  });

  if (member) {
    const resetToken = randomToken();
    const link = `${env.FRONTEND_URL}/password/reset?token=${encodeURIComponent(resetToken)}`;
    try {
      await sendMail(passwordResetMail(email, link));
    } catch (err) {
      console.error('비밀번호 재설정 메일 발송 실패', err);
      throw new AppError(AccountError.EMAIL_SEND_FAILED, '메일을 보내지 못했어요.');
    }

    const payload: PasswordResetPayload = { userId: member.id.toString() };
    await prisma.$transaction(async (tx) => {
      // 다시 보내면 이전 링크는 무효
      await tx.authTemporaryToken.updateMany({
        where: {
          tokenType: 'PASSWORD_RESET',
          usedAt: null,
          payload: { path: '$.userId', equals: payload.userId },
        },
        data: { usedAt: now },
      });
      await createTemporaryToken(tx, {
        token: resetToken,
        type: 'PASSWORD_RESET',
        payload: { ...payload },
        expiresInSeconds: PASSWORD_RESET_EXPIRES_IN,
        now,
      });
    });
  }

  resetMailRequests.record(email, nowMs);
  return {
    email,
    expiresIn: PASSWORD_RESET_EXPIRES_IN,
    resendAvailableIn: PASSWORD_RESET_RESEND_INTERVAL,
  };
}

/** 재설정 토큰을 확인하고 대상 회원을 돌려준다 (소비하지 않음) */
async function loadResetTarget(token: string, now: Date) {
  const row = await findTemporaryToken(prisma, token, 'PASSWORD_RESET');
  if (!row) throw new AppError(AccountError.PASSWORD_RESET_TOKEN_INVALID);
  const state = tokenState(row, now);
  if (state === 'used') throw new AppError(AccountError.PASSWORD_RESET_TOKEN_INVALID);
  if (state === 'expired') throw new AppError(AccountError.PASSWORD_RESET_TOKEN_EXPIRED);

  const { userId } = readPayload<PasswordResetPayload>(row);
  const member = await prisma.member.findUnique({ where: { id: BigInt(userId) } });
  if (
    !member ||
    !member.email ||
    !member.password ||
    (member.status !== MemberStatus.PENDING && member.status !== MemberStatus.ACTIVE)
  ) {
    throw new AppError(AccountError.PASSWORD_RESET_TOKEN_INVALID);
  }
  return { row, member: { ...member, email: member.email, password: member.password } };
}

/** AUTH-13 비밀번호 재설정 링크 확인 */
export async function checkPasswordResetToken(token: string, now = new Date()) {
  const { row, member } = await loadResetTarget(token, now);
  return { maskedEmail: maskEmail(member.email), expiresAt: toKstIso(row.expiresAt) };
}

/** AUTH-14 새 비밀번호 설정. 모든 기기에서 로그아웃하고 로그인 잠금을 푼다 */
export async function resetPassword(token: string, newPassword: string, now = new Date()) {
  const { row, member } = await loadResetTarget(token, now);
  if (await verifySecret(newPassword, member.password)) {
    throw new AppError(AccountError.SAME_AS_CURRENT_PASSWORD);
  }
  const passwordHash = await hashSecret(newPassword);

  await prisma.$transaction(async (tx) => {
    if (!(await consumeTemporaryToken(tx, row.id, now))) {
      throw new AppError(AccountError.PASSWORD_RESET_TOKEN_INVALID);
    }
    await tx.member.update({
      where: { id: member.id },
      data: { password: passwordHash, loginFailCount: 0, lockedUntil: null },
    });
    await revokeAllRefreshTokens(tx, member.id, now);
  });
}

// SET-05: 지금 비밀번호를 5번 틀리면 10분 막는다 (로그인 잠금과 따로 센다).
const PASSWORD_ATTEMPT_LIMIT = 5;
const PASSWORD_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const wrongCurrentPassword = new RecentEvents(PASSWORD_ATTEMPT_WINDOW_MS);

/** SET-05 비밀번호 변경. 다른 기기는 로그아웃하고 지금 기기에는 새 토큰을 준다 */
export async function changePassword(
  userId: bigint,
  input: { currentPassword: string; newPassword: string },
  now = new Date(),
) {
  const key = userId.toString();
  const nowMs = now.getTime();

  const member = await prisma.member.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, password: true },
  });
  if (!member.password) throw new AppError(AccountError.PASSWORD_NOT_SET);

  if (
    wrongCurrentPassword.count(key, PASSWORD_ATTEMPT_WINDOW_MS, nowMs) >= PASSWORD_ATTEMPT_LIMIT
  ) {
    throw new AppError(AccountError.TOO_MANY_PASSWORD_ATTEMPTS);
  }
  if (!(await verifySecret(input.currentPassword, member.password))) {
    wrongCurrentPassword.record(key, nowMs);
    throw new AppError(AccountError.CURRENT_PASSWORD_INCORRECT);
  }
  wrongCurrentPassword.clear(key);

  if (await verifySecret(input.newPassword, member.password)) {
    throw new AppError(
      AccountError.SAME_AS_CURRENT_PASSWORD,
      '지금 비밀번호와 다르게 정해 주세요.',
    );
  }
  const passwordHash = await hashSecret(input.newPassword);

  const refreshToken = await prisma.$transaction(async (tx) => {
    await tx.member.update({ where: { id: member.id }, data: { password: passwordHash } });
    await revokeAllRefreshTokens(tx, member.id, now);
    return createRefreshToken(tx, member.id, now);
  });

  return {
    refreshToken,
    data: {
      accessToken: accessTokenBody(member.id).accessToken,
      accessTokenExpiresIn: ACCESS_TOKEN_EXPIRES_IN,
      passwordChangedAt: toKstIso(now),
    },
  };
}
