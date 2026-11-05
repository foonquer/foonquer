import { Router, type Response } from 'express';
import type { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { validate } from '../../common/middlewares/validate';
import { ok } from '../../common/response';
import { oauthExchangeBody } from './auth.schema';
import { oauthRouter } from './oauth/oauth.router';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-token';
import { logout, refreshSession } from './session.service';
import { exchangeOAuthResult } from './social-login.service';

/** /api/v1/auth — 로그인 없이 부르는 카카오 로그인·토큰 API (로그인은 카카오 하나만 쓴다) */
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

// AUTH-08 카카오 로그인 결과 교환
authRouter.post('/oauth/exchange', validate({ body: oauthExchangeBody }), async (req, res) => {
  const { oauthResultCode } = req.body as z.infer<typeof oauthExchangeBody>;
  const { refreshToken, data, message } = await exchangeOAuthResult(oauthResultCode);
  setRefreshCookie(res, refreshToken);
  ok(res, data, message);
});

// AUTH-06·07 카카오 로그인 시작·콜백 (페이지 이동). /oauth/exchange보다 뒤에 둔다.
authRouter.use('/oauth', oauthRouter);
