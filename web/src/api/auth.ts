// 카카오 로그인·약관 동의 API (명세서 AUTH-06 ~ 08, 10, 11, 15). 로그인은 카카오 하나만 쓴다

import { api } from '../lib/api';
import { API_PREFIX } from '../lib/config';
import type { NextAction } from '../lib/session';

export type AuthUser = {
  id: number;
  nickname: string | null;
  profileImageUrl: string | null;
  status: 'P' | 'A' | 'S';
};

export type TokenResult = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  nextAction: NextAction;
  user: AuthUser;
};

export type Consents = { terms: boolean; privacy: boolean; location: boolean; marketing: boolean };

export const NO_CONSENTS: Consents = {
  terms: false,
  privacy: false,
  location: false,
  marketing: false,
};

/** 필수 약관 3개(이용약관·개인정보·위치기반)에 모두 동의했는지 */
export function hasRequiredConsents(c: Consents) {
  return c.terms && c.privacy && c.location;
}

/** AUTH-06 카카오 로그인 시작 주소 (페이지를 이동한다) */
export const kakaoLoginUrl = `${API_PREFIX}/auth/oauth/kakao`;

/** AUTH-08 카카오 로그인 결과 교환 */
export const exchangeOAuthCode = (oauthResultCode: string) =>
  api.post<TokenResult & { isNewUser: boolean }>('/auth/oauth/exchange', { oauthResultCode });

/** AUTH-11 로그아웃 (refreshToken 쿠키 폐기) */
export const logout = () => api.post<null>('/auth/logout');

/** AUTH-15 약관 동의 저장 */
export const saveConsents = (consents: Consents) =>
  api.post<{ nextAction: NextAction }>('/users/me/consents', consents);
