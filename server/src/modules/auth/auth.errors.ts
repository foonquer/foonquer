import { defineErrors } from '../../common/errors/error-codes';

// 코드 이름·상태·문구는 API 명세서 AUTH-06 ~ 08, AUTH-10, AUTH-15의 Error 항목을 그대로 옮겼다.
// 로그인은 카카오 하나만 쓴다 (2026-11-05).

export const AccountError = defineErrors({
  // 약관 동의 (AUTH-15)
  REQUIRED_CONSENT_MISSING: {
    status: 400,
    code: 'REQUIRED_CONSENT_MISSING',
    message: '필수 약관에 모두 동의해 주세요.',
  },
  POLICY_DOCUMENT_NOT_FOUND: {
    status: 404,
    code: 'POLICY_DOCUMENT_NOT_FOUND',
    message: '시행 중인 약관을 찾을 수 없어요.',
  },

  // 토큰 재발급 (AUTH-10)
  REFRESH_TOKEN_REQUIRED: {
    status: 401,
    code: 'REFRESH_TOKEN_REQUIRED',
    message: '다시 로그인해 주세요.',
  },
  REFRESH_TOKEN_INVALID: {
    status: 401,
    code: 'REFRESH_TOKEN_INVALID',
    message: '다시 로그인해 주세요.',
  },
  REFRESH_TOKEN_EXPIRED: {
    status: 401,
    code: 'REFRESH_TOKEN_EXPIRED',
    message: '로그인이 만료되었어요. 다시 로그인해 주세요.',
  },
  MEMBER_WITHDRAWN: { status: 403, code: 'MEMBER_WITHDRAWN', message: '탈퇴한 계정이에요.' },

  // 카카오 로그인 (AUTH-06 ~ 08). AUTH-06·07은 JSON이 아니라 {FRONT}/oauth/callback?error=코드 로 보낸다.
  OAUTH_STATE_MISMATCH: {
    status: 400,
    code: 'OAUTH_STATE_MISMATCH',
    message: '로그인 요청이 올바르지 않아요. 다시 시도해 주세요.',
  },
  OAUTH_CANCELLED: { status: 400, code: 'OAUTH_CANCELLED', message: '로그인을 취소했어요.' },
  SOCIAL_LOGIN_FAILED: {
    status: 500,
    code: 'SOCIAL_LOGIN_FAILED',
    message: '카카오 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.',
  },
  OAUTH_RESULT_CODE_REQUIRED: {
    status: 400,
    code: 'OAUTH_RESULT_CODE_REQUIRED',
    message: 'oauthResultCode가 필요해요.',
  },
  OAUTH_RESULT_CODE_INVALID: {
    status: 400,
    code: 'OAUTH_RESULT_CODE_INVALID',
    message: '잘못되었거나 이미 쓴 로그인 코드예요. 다시 로그인해 주세요.',
  },
  OAUTH_RESULT_CODE_EXPIRED: {
    status: 401,
    code: 'OAUTH_RESULT_CODE_EXPIRED',
    message: '로그인 시간이 지났어요. 다시 로그인해 주세요.',
  },
});
