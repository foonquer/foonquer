// 입력값 규칙 (서버 규칙과 같게 맞춘다. 서버가 최종 확인한다)

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string) {
  return value.length <= 255 && EMAIL_PATTERN.test(value);
}

/** 비밀번호: 8~64자, 영문·숫자 각 1자 이상, 공백 없음 */
export function isValidPassword(value: string) {
  return (
    value.length >= 8 &&
    value.length <= 64 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value) &&
    !/\s/.test(value)
  );
}

export const PASSWORD_RULE_MESSAGE = '비밀번호는 영문·숫자 포함 8자 이상이에요.';
export const PASSWORD_MISMATCH_MESSAGE = '비밀번호가 일치하지 않아요';

/** 남은 초를 "4:31"로 */
export function formatCountdown(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
