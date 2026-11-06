import { env } from '../../../config/env';

/** 경로 변수 provider ↔ DB 코드 (social_account.provider) */
export const PROVIDERS = {
  kakao: { code: 'K', name: '카카오', loginMethod: 'KAKAO' },
  google: { code: 'G', name: '구글', loginMethod: 'GOOGLE' },
} as const;

export type ProviderSlug = keyof typeof PROVIDERS;
export type ProviderCode = (typeof PROVIDERS)[ProviderSlug]['code'];

export function isProviderSlug(value: string): value is ProviderSlug {
  return Object.hasOwn(PROVIDERS, value);
}

export function providerByCode(code: string) {
  return Object.values(PROVIDERS).find((p) => p.code === code) ?? null;
}

/** 제공자에게서 받은 사용자 정보 (토큰은 저장하지 않는다) */
export interface OAuthProfile {
  providerId: string;
  email: string | null;
  /** 제공자가 이메일 주인을 확인했는지 — true일 때만 같은 이메일 계정 연동을 판단한다 */
  emailVerified: boolean;
}

/** 설정이 빠졌거나 제공자 요청이 실패했을 때 */
export class OAuthProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'OAuthProviderError';
  }
}

const TIMEOUT_MS = 5000;

export function redirectUri(slug: ProviderSlug) {
  return `${env.API_BASE_URL}/api/v1/auth/oauth/${slug}/callback`;
}

function requireConfig(value: string | undefined, name: string): string {
  if (!value) throw new OAuthProviderError(`${name} 환경변수가 없습니다.`);
  return value;
}

/** AUTH-06에서 보낼 제공자 인증 화면 주소 */
export function authorizeUrl(slug: ProviderSlug, state: string): string {
  if (slug === 'kakao') {
    const url = new URL('https://kauth.kakao.com/oauth/authorize');
    url.searchParams.set('client_id', requireConfig(env.KAKAO_REST_API_KEY, 'KAKAO_REST_API_KEY'));
    url.searchParams.set('redirect_uri', redirectUri(slug));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    // profile_nickname은 선택 동의라 요청하지 않는다. 이메일은 연동 판단에만 쓴다.
    url.searchParams.set('scope', 'account_email');
    return url.toString();
  }
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', requireConfig(env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID'));
  url.searchParams.set('redirect_uri', redirectUri(slug));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

async function requestJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new OAuthProviderError(`요청 실패: ${url}`, { cause: err });
  }
  if (!res.ok) throw new OAuthProviderError(`응답 ${res.status}: ${url}`);
  const body = (await res.json().catch(() => null)) as unknown;
  if (!body || typeof body !== 'object') throw new OAuthProviderError(`JSON이 아닙니다: ${url}`);
  return body as Record<string, unknown>;
}

function form(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    // 비워 둔 설정(KAKAO_CLIENT_SECRET= 등)은 보내지 않는다 (requireConfig와 같은 기준)
    if (value) params.set(key, value);
  }
  return params;
}

async function kakaoProfile(code: string): Promise<OAuthProfile> {
  const token = await requestJson('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: form({
      grant_type: 'authorization_code',
      client_id: requireConfig(env.KAKAO_REST_API_KEY, 'KAKAO_REST_API_KEY'),
      client_secret: env.KAKAO_CLIENT_SECRET,
      redirect_uri: redirectUri('kakao'),
      code,
    }),
  });
  if (typeof token.access_token !== 'string') {
    throw new OAuthProviderError('카카오 access_token이 없습니다.');
  }

  const me = await requestJson('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (typeof me.id !== 'number' && typeof me.id !== 'string') {
    throw new OAuthProviderError('카카오 사용자 id가 없습니다.');
  }
  const account = (me.kakao_account ?? {}) as Record<string, unknown>;
  const email = typeof account.email === 'string' ? account.email.trim().toLowerCase() : null;
  return {
    providerId: String(me.id),
    email,
    emailVerified: !!email && account.is_email_valid === true && account.is_email_verified === true,
  };
}

async function googleProfile(code: string): Promise<OAuthProfile> {
  const token = await requestJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      grant_type: 'authorization_code',
      client_id: requireConfig(env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID'),
      client_secret: requireConfig(env.GOOGLE_CLIENT_SECRET, 'GOOGLE_CLIENT_SECRET'),
      redirect_uri: redirectUri('google'),
      code,
    }),
  });
  if (typeof token.access_token !== 'string') {
    throw new OAuthProviderError('구글 access_token이 없습니다.');
  }

  const me = await requestJson('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (typeof me.sub !== 'string') throw new OAuthProviderError('구글 사용자 id(sub)가 없습니다.');
  const email = typeof me.email === 'string' ? me.email.trim().toLowerCase() : null;
  return { providerId: me.sub, email, emailVerified: !!email && me.email_verified === true };
}

/** AUTH-07: authorization code로 제공자 사용자 정보를 받는다 */
export function fetchOAuthProfile(slug: ProviderSlug, code: string): Promise<OAuthProfile> {
  return slug === 'kakao' ? kakaoProfile(code) : googleProfile(code);
}
