import { defineErrors } from '../../common/errors/error-codes';

// 코드 이름·상태·문구는 API 명세서 AUTH-01 ~ AUTH-14, SET-05의 Error 항목을 그대로 옮겼다.

export const AccountError = defineErrors({
  // 입력값
  EMAIL_REQUIRED: { status: 400, code: 'EMAIL_REQUIRED', message: '이메일을 입력해 주세요.' },
  INVALID_EMAIL_FORMAT: {
    status: 400,
    code: 'INVALID_EMAIL_FORMAT',
    message: '이메일 형식이 올바르지 않아요.',
  },
  INVALID_PASSWORD_FORMAT: {
    status: 400,
    code: 'INVALID_PASSWORD_FORMAT',
    message: '비밀번호는 영문·숫자 포함 8자 이상이에요.',
  },
  PASSWORD_MISMATCH: {
    status: 400,
    code: 'PASSWORD_MISMATCH',
    message: '비밀번호가 일치하지 않아요.',
  },
  REQUIRED_CONSENT_MISSING: {
    status: 400,
    code: 'REQUIRED_CONSENT_MISSING',
    message: '필수 약관에 모두 동의해 주세요.',
  },

  // 가입 중복 (AUTH-01, 02, 04)
  EMAIL_ALREADY_EXISTS: {
    status: 409,
    code: 'EMAIL_ALREADY_EXISTS',
    message: '이미 가입한 이메일이에요.',
  },
  SOCIAL_ACCOUNT_EXISTS: {
    status: 409,
    code: 'SOCIAL_ACCOUNT_EXISTS',
    message: '카카오(또는 구글)로 가입한 이메일이에요.',
  },

  // 이메일 인증 코드 (AUTH-02, 03)
  VERIFICATION_CODE_RESEND_TOO_SOON: {
    status: 429,
    code: 'VERIFICATION_CODE_RESEND_TOO_SOON',
    message: '잠시 후에 다시 보낼 수 있어요.',
  },
  VERIFICATION_CODE_SEND_LIMIT: {
    status: 429,
    code: 'VERIFICATION_CODE_SEND_LIMIT',
    message: '인증 코드를 너무 많이 요청했어요. 1시간 뒤에 다시 시도해 주세요.',
  },
  EMAIL_SEND_FAILED: {
    status: 500,
    code: 'EMAIL_SEND_FAILED',
    message: '메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
  },
  VERIFICATION_CODE_REQUIRED: {
    status: 400,
    code: 'VERIFICATION_CODE_REQUIRED',
    message: '인증 코드를 입력해 주세요.',
  },
  INVALID_VERIFICATION_CODE_FORMAT: {
    status: 400,
    code: 'INVALID_VERIFICATION_CODE_FORMAT',
    message: '인증 코드는 숫자 6자리예요.',
  },
  VERIFICATION_CODE_MISMATCH: {
    status: 400,
    code: 'VERIFICATION_CODE_MISMATCH',
    message: '인증 코드가 맞지 않아요.',
  },
  VERIFICATION_CODE_EXPIRED: {
    status: 400,
    code: 'VERIFICATION_CODE_EXPIRED',
    message: '인증 코드가 만료되었어요. 다시 받아 주세요.',
  },
  VERIFICATION_REQUEST_NOT_FOUND: {
    status: 404,
    code: 'VERIFICATION_REQUEST_NOT_FOUND',
    message: '인증 요청을 찾을 수 없어요. 코드를 다시 받아 주세요.',
  },
  VERIFICATION_ATTEMPTS_EXCEEDED: {
    status: 429,
    code: 'VERIFICATION_ATTEMPTS_EXCEEDED',
    message: '인증 코드를 5번 틀렸어요. 코드를 다시 받아 주세요.',
  },

  // 회원가입 (AUTH-04)
  EMAIL_VERIFICATION_MISMATCH: {
    status: 400,
    code: 'EMAIL_VERIFICATION_MISMATCH',
    message: '인증한 이메일과 가입 이메일이 달라요.',
  },
  EMAIL_VERIFICATION_TOKEN_INVALID: {
    status: 401,
    code: 'EMAIL_VERIFICATION_TOKEN_INVALID',
    message: '이메일 인증이 필요해요.',
  },
  EMAIL_VERIFICATION_TOKEN_EXPIRED: {
    status: 401,
    code: 'EMAIL_VERIFICATION_TOKEN_EXPIRED',
    message: '이메일 인증 시간이 지났어요. 다시 인증해 주세요.',
  },
  POLICY_DOCUMENT_NOT_FOUND: {
    status: 404,
    code: 'POLICY_DOCUMENT_NOT_FOUND',
    message: '시행 중인 약관을 찾을 수 없어요.',
  },

  // 로그인 (AUTH-05)
  LOGIN_INVALID_CREDENTIALS: {
    status: 401,
    code: 'LOGIN_INVALID_CREDENTIALS',
    message: '이메일 또는 비밀번호가 맞지 않아요.',
  },
  LOGIN_LOCKED: {
    status: 423,
    code: 'LOGIN_LOCKED',
    message: '비밀번호를 5번 틀려 10분 동안 로그인할 수 없어요.',
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

  // 비밀번호 재설정 (AUTH-12 ~ 14)
  PASSWORD_RESET_RESEND_TOO_SOON: {
    status: 429,
    code: 'PASSWORD_RESET_RESEND_TOO_SOON',
    message: '잠시 후에 다시 보낼 수 있어요.',
  },
  PASSWORD_RESET_SEND_LIMIT: {
    status: 429,
    code: 'PASSWORD_RESET_SEND_LIMIT',
    message: '메일을 너무 많이 요청했어요. 1시간 뒤에 다시 시도해 주세요.',
  },
  PASSWORD_RESET_TOKEN_REQUIRED: {
    status: 400,
    code: 'PASSWORD_RESET_TOKEN_REQUIRED',
    message: '잘못된 링크예요.',
  },
  PASSWORD_RESET_TOKEN_INVALID: {
    status: 401,
    code: 'PASSWORD_RESET_TOKEN_INVALID',
    message: '이미 쓴 링크이거나 잘못된 링크예요. 메일을 다시 받아 주세요.',
  },
  PASSWORD_RESET_TOKEN_EXPIRED: {
    status: 401,
    code: 'PASSWORD_RESET_TOKEN_EXPIRED',
    message: '링크 유효시간(30분)이 지났어요. 메일을 다시 받아 주세요.',
  },
  SAME_AS_CURRENT_PASSWORD: {
    status: 400,
    code: 'SAME_AS_CURRENT_PASSWORD',
    message: '이전에 쓰던 비밀번호와 다르게 정해 주세요.',
  },

  // 비밀번호 변경 (SET-05)
  CURRENT_PASSWORD_INCORRECT: {
    status: 400,
    code: 'CURRENT_PASSWORD_INCORRECT',
    message: '지금 비밀번호가 맞지 않아요.',
  },
  PASSWORD_NOT_SET: {
    status: 403,
    code: 'PASSWORD_NOT_SET',
    message: '소셜로만 가입한 계정은 비밀번호가 없어요.',
  },
  TOO_MANY_PASSWORD_ATTEMPTS: {
    status: 429,
    code: 'TOO_MANY_PASSWORD_ATTEMPTS',
    message: '잠시 후 다시 시도해 주세요.',
  },
});
