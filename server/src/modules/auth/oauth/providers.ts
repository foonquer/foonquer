import { env } from '../../../config/env';

/** 카카오에서 받은 사용자 정보 (토큰은 저장하지 않는다). 로그인은 카카오 하나만 쓴다 */
export interface KakaoProfile {
  /** 카카오 회원번호 */
  kakaoId: string;
}

/** 설정이 빠졌거나 카카오 요청이 실패했을 때 */
export class OAuthProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'OAuthProviderError';
  }
}

const TIMEOUT_MS = 5000;

export function kakaoRedirectUri() {
  return `${env.API_BASE_URL}/api/v1/auth/oauth/kakao/callback`;
}

function requireConfig(value: string | undefined, name: string): string {
  if (!value) throw new OAuthProviderError(`${name} 환경변수가 없습니다.`);
  return value;
}

/**
 * AUTH-06에서 보낼 카카오 인증 화면 주소.
 * 동의 항목(scope)은 요청하지 않는다 — 카카오 회원번호만 쓰고 이메일·닉네임은 받지 않는다.
 */
export function kakaoAuthorizeUrl(state: string): string {
  const url = new URL('https://kauth.kakao.com/oauth/authorize');
  url.searchParams.set('client_id', requireConfig(env.KAKAO_REST_API_KEY, 'KAKAO_REST_API_KEY'));
  url.searchParams.set('redirect_uri', kakaoRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
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

/** AUTH-07: authorization code로 카카오 회원번호를 받는다 */
export async function fetchKakaoProfile(code: string): Promise<KakaoProfile> {
  const token = await requestJson('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: form({
      grant_type: 'authorization_code',
      client_id: requireConfig(env.KAKAO_REST_API_KEY, 'KAKAO_REST_API_KEY'),
      client_secret: env.KAKAO_CLIENT_SECRET,
      redirect_uri: kakaoRedirectUri(),
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
  return { kakaoId: String(me.id) };
}
