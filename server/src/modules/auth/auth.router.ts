import { Router, type Response } from 'express';
import type { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { rateLimit } from '../../common/middlewares/rate-limit';
import { validate } from '../../common/middlewares/validate';
import { created, ok } from '../../common/response';
import {
  emailAvailabilityQuery,
  loginBody,
  passwordResetBody,
  passwordResetEmailBody,
  passwordResetTokenQuery,
  signupBody,
  verificationCodeSendBody,
  verificationCodeVerifyBody,
} from './auth.schema';
import {
  checkEmailAvailability,
  sendVerificationCode,
  signupWithEmail,
  verifyEmailCode,
} from './email-signup.service';
import { checkPasswordResetToken, resetPassword, sendPasswordResetMail } from './password.service';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-token';
import { loginWithEmail, logout, refreshSession } from './session.service';

/** /api/v1/auth — 로그인 없이 부르는 회원가입·로그인 API */
export const authRouter = Router();

/** 재발급 실패(401·403)면 브라우저의 refreshToken 쿠키도 지운다 */
async function withCookieCleanup<T>(res: Response, run: () => Promise<T>) {
  try {
    return await run();
  } catch (err) {
    if (err instanceof AppError && (err.status === 401 || err.status === 403)) {
      clearRefreshCookie(res);
    }
    throw err;
  }
}

// AUTH-01 이메일 중복 확인 (같은 IP 1분 30회)
authRouter.get(
  '/email/availability',
  rateLimit({ windowMs: 60_000, limit: 30 }),
  validate({ query: emailAvailabilityQuery }),
  async (req, res) => {
    const { email } = req.query as unknown as z.infer<typeof emailAvailabilityQuery>;
    const { data, message } = await checkEmailAvailability(email);
    ok(res, data, message);
  },
);

// AUTH-02 이메일 인증 코드 발송
authRouter.post(
  '/email/verification-code',
  validate({ body: verificationCodeSendBody }),
  async (req, res) => {
    const { email } = req.body as z.infer<typeof verificationCodeSendBody>;
    const data = await sendVerificationCode(email);
    ok(res, data, '인증 코드를 보냈어요. 5분 안에 입력해 주세요.');
  },
);

// AUTH-03 이메일 인증 코드 확인
authRouter.post(
  '/email/verification-code/verify',
  validate({ body: verificationCodeVerifyBody }),
  async (req, res) => {
    const { email, code } = req.body as z.infer<typeof verificationCodeVerifyBody>;
    const data = await verifyEmailCode(email, code);
    ok(res, data, '이메일 인증이 완료되었어요.');
  },
);

// AUTH-04 이메일 회원가입
authRouter.post('/signup', validate({ body: signupBody }), async (req, res) => {
  const { refreshToken, data } = await signupWithEmail(req.body as z.infer<typeof signupBody>);
  setRefreshCookie(res, refreshToken);
  created(res, data, '가입했어요. 프로필을 설정해 주세요.');
});

// AUTH-05 이메일 로그인
authRouter.post(
  '/login',
  validate({ body: loginBody }, { validationMessage: '이메일과 비밀번호를 입력해 주세요.' }),
  async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginBody>;
    const { refreshToken, data } = await loginWithEmail(email, password);
    setRefreshCookie(res, refreshToken);
    ok(res, data, '로그인했어요.');
  },
);

// AUTH-10 토큰 재발급 (refreshToken 쿠키)
authRouter.post('/refresh', async (req, res) => {
  const { refreshToken, data } = await withCookieCleanup(res, () =>
    refreshSession(readRefreshCookie(req)),
  );
  setRefreshCookie(res, refreshToken);
  ok(res, data, '토큰을 재발급했어요.');
});

// AUTH-11 로그아웃 (accessToken이 만료되었어도 됨)
authRouter.post('/logout', async (req, res) => {
  await logout(readRefreshCookie(req));
  clearRefreshCookie(res);
  ok(res, null, '로그아웃했어요.');
});

// AUTH-12 비밀번호 재설정 메일 발송
authRouter.post(
  '/password/reset-email',
  validate({ body: passwordResetEmailBody }),
  async (req, res) => {
    const { email } = req.body as z.infer<typeof passwordResetEmailBody>;
    const data = await sendPasswordResetMail(email);
    ok(res, data, '메일을 보냈어요. 30분 안에 링크를 눌러 주세요.');
  },
);

// AUTH-13 비밀번호 재설정 링크 확인
authRouter.get(
  '/password/reset-token',
  validate({ query: passwordResetTokenQuery }),
  async (req, res) => {
    const { token } = req.query as unknown as z.infer<typeof passwordResetTokenQuery>;
    const data = await checkPasswordResetToken(token);
    ok(res, data, '새 비밀번호를 정해 주세요.');
  },
);

// AUTH-14 새 비밀번호 설정
authRouter.post('/password/reset', validate({ body: passwordResetBody }), async (req, res) => {
  const { token, newPassword } = req.body as z.infer<typeof passwordResetBody>;
  await resetPassword(token, newPassword);
  ok(res, null, '비밀번호를 바꿨어요. 새 비밀번호로 다시 로그인해 주세요.');
});
