/** 닉네임 규칙: 2~10자, 완성형 한글·영문·숫자만, 공백 불가 (USER-01 비고) */
const ALLOWED = /^[가-힣a-zA-Z0-9]*$/;

export type NicknameProblem = 'INVALID_LENGTH' | 'INVALID_CHARACTER';

/** 규칙에 맞으면 null, 아니면 이유 (글자 종류를 먼저 본다) */
export function nicknameProblem(nickname: string): NicknameProblem | null {
  if (!ALLOWED.test(nickname)) return 'INVALID_CHARACTER';
  const length = [...nickname].length;
  if (length < 2 || length > 10) return 'INVALID_LENGTH';
  return null;
}

/** 닉네임은 30일에 한 번만 바꿀 수 있다 */
export const NICKNAME_CHANGE_INTERVAL_DAYS = 30;

/** 다음에 닉네임을 바꿀 수 있는 시각. 지금 바꿀 수 있으면 null */
export function nicknameChangeableAt(changedAt: Date | null, now = new Date()): Date | null {
  if (!changedAt) return null;
  const next = new Date(changedAt.getTime() + NICKNAME_CHANGE_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  return next > now ? next : null;
}
