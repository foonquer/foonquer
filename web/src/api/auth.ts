// 회원가입·로그인 API (명세서 AUTH-01 ~ 15)

import { api } from '../lib/api';
import { API_PREFIX } from '../lib/config';
import type { NextAction } from '../lib/session';

export type Provider = 'kakao' | 'google';

export type AuthUser = {
  id: number;
  email: string | null;
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

/** AUTH-01 이메일 중복 확인 */
export type EmailAvailability = {
  email: string;
  available: boolean;
  reason: null | 'EMAIL_ALREADY_EXISTS' | 'SOCIAL_ACCOUNT_EXISTS';
  provider: null | 'K' | 'G';
};
export const checkEmail = (email: string) =>
  api.call<EmailAvailability>('GET', '/auth/email/availability', { query: { email } });

/** AUTH-02 인증 코드 보내기 */
export const sendVerificationCode = (email: string) =>
  api.post<{ email: string; expiresIn: number; resendAvailableIn: number }>(
    '/auth/email/verification-code',
    { email },
  );

/** AUTH-03 인증 코드 확인 */
export const verifyCode = (email: string, code: string) =>
  api.post<{ emailVerificationToken: string; expiresIn: number }>(
    '/auth/email/verification-code/verify',
    { email, code },
  );

/** AUTH-04 이메일 회원가입 */
export const signup = (body: {
  email: string;
  password: string;
  passwordConfirm: string;
  emailVerificationToken: string;
  consents: Consents;
}) => api.post<TokenResult>('/auth/signup', body);

/** AUTH-05 이메일 로그인 */
export const login = (email: string, password: string) =>
  api.post<TokenResult>('/auth/login', { email, password });

/** AUTH-11 로그아웃 (refreshToken 쿠키 폐기) */
export const logout = () => api.post<null>('/auth/logout');

/** AUTH-12 비밀번호 재설정 메일 */
export const sendPasswordResetMail = (email: string) =>
  api.post<{ email: string; expiresIn: number; resendAvailableIn: number }>(
    '/auth/password/reset-email',
    { email },
  );

/** AUTH-13 재설정 링크 확인 */
export const checkPasswordResetToken = (token: string) =>
  api.get<{ maskedEmail: string; expiresAt: string }>('/auth/password/reset-token', { token });

/** AUTH-14 새 비밀번호 설정 */
export const resetPassword = (token: string, newPassword: string, newPasswordConfirm: string) =>
  api.post<null>('/auth/password/reset', { token, newPassword, newPasswordConfirm });

/** AUTH-06 소셜 로그인 시작 주소 (페이지를 이동한다) */
export const oauthStartUrl = (provider: Provider) => `${API_PREFIX}/auth/oauth/${provider}`;

export type AccountLinkRequired = {
  nextAction: 'ACCOUNT_LINK_REQUIRED';
  accountLinkToken: string;
  accountLinkTokenExpiresIn: number;
  provider: 'K' | 'G';
  maskedEmail: string;
  existingLoginMethods: string[];
};

/** AUTH-08 소셜 로그인 결과 교환 */
export const exchangeOAuthCode = (oauthResultCode: string) =>
  api.post<(TokenResult & { isNewUser: boolean }) | AccountLinkRequired>('/auth/oauth/exchange', {
    oauthResultCode,
  });

/** AUTH-09 소셜 계정 연동 */
export const linkSocialAccount = (accountLinkToken: string) =>
  api.post<TokenResult & { linkedProvider: 'K' | 'G' }>('/auth/oauth/link', { accountLinkToken });

/** AUTH-15 약관 동의 저장 (소셜 가입자) */
export const saveConsents = (consents: Consents) =>
  api.post<{ nextAction: NextAction }>('/users/me/consents', consents);
