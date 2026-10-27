import { timingSafeEqual } from 'node:crypto';
import { Router, type CookieOptions, type Response } from 'express';
import { readCookie } from '../../../common/cookies';
import { randomToken } from '../../../common/crypto';
import { env } from '../../../config/env';
import { createOAuthResultCode } from '../social-login.service';
import { authorizeUrl, fetchOAuthProfile, isProviderSlug, OAuthProviderError } from './providers';

/**
 * /api/v1/auth/oauth — 소셜 로그인 시작(AUTH-06)과 콜백(AUTH-07).
 * fetch로 부르는 API가 아니라 페이지 이동이라 JSON 대신 302로 답하고, 실패하면
 * {FRONTEND_URL}/oauth/callback?error=코드 로 보낸다.
 */
export const oauthRouter = Router();

const STATE_COOKIE = 'oauth_state';
const STATE_COOKIE_PATH = '/api/v1/auth/oauth';
const STATE_EXPIRES_IN_MS = 10 * 60 * 1000;

function stateCookieOptions(): CookieOptions {
  return { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: STATE_COOKIE_PATH };
}

function frontCallback(params: Record<string, string>) {
  const url = new URL(`${env.FRONTEND_URL}/oauth/callback`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function redirectError(res: Response, code: string) {
  res.redirect(302, frontCallback({ error: code }));
}

function sameState(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// AUTH-06 소셜 로그인 시작
oauthRouter.get('/:provider', (req, res) => {
  const { provider } = req.params;
  if (!isProviderSlug(provider)) {
    redirectError(res, 'UNSUPPORTED_PROVIDER');
    return;
  }

  const state = randomToken(16);
  let location: string;
  try {
    location = authorizeUrl(provider, state);
  } catch (err) {
    console.error('소셜 로그인 설정 오류', err);
    redirectError(res, 'SOCIAL_LOGIN_FAILED');
    return;
  }
  res.cookie(STATE_COOKIE, state, { ...stateCookieOptions(), maxAge: STATE_EXPIRES_IN_MS });
  res.redirect(302, location);
});

// AUTH-07 소셜 로그인 콜백
oauthRouter.get('/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const query = req.query as Record<string, unknown>;
  const savedState = readCookie(req, STATE_COOKIE);
  // state는 한 번만 쓴다.
  res.cookie(STATE_COOKIE, '', { ...stateCookieOptions(), maxAge: 0 });

  if (!isProviderSlug(provider)) {
    redirectError(res, 'UNSUPPORTED_PROVIDER');
    return;
  }
  if (
    savedState === null ||
    typeof query.state !== 'string' ||
    !sameState(savedState, query.state)
  ) {
    redirectError(res, 'OAUTH_STATE_MISMATCH');
    return;
  }
  if (query.error === 'access_denied') {
    redirectError(res, 'OAUTH_CANCELLED');
    return;
  }
  if (typeof query.code !== 'string' || query.code.length === 0) {
    redirectError(res, 'SOCIAL_LOGIN_FAILED');
    return;
  }

  try {
    const profile = await fetchOAuthProfile(provider, query.code);
    const oauthResultCode = await createOAuthResultCode(provider, profile);
    res.redirect(302, frontCallback({ code: oauthResultCode }));
  } catch (err) {
    if (!(err instanceof OAuthProviderError)) throw err;
    console.error('소셜 로그인 제공자 요청 실패', err);
    redirectError(res, 'SOCIAL_LOGIN_FAILED');
  }
});
