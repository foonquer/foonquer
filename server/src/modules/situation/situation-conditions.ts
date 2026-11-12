import { z } from 'zod';

// 상황 직접 입력 추천의 조건 값 목록 (피그마 3-4 개발 메모 3번). 화면 ③ 시트의 칩과 반드시 같게 둔다.
// AI도 규칙도 이 목록 안에서만 고르고, 목록에 없는 말은 버린다.

/** 누구랑 (하나) */
export const WHO = {
  SOLO: '혼자',
  FRIEND: '친구',
  COUPLE: '연인',
  FAMILY: '가족 · 부모님',
  KIDS: '아이와',
  GROUP: '단체 · 회식',
} as const;

/** 언제 (하나) */
export const WHEN = {
  WEEKDAY_LUNCH: '평일 점심',
  WEEKEND_LUNCH: '주말 점심',
  DINNER: '저녁',
  LATE_NIGHT: '늦은 밤',
} as const;

/** 빼기 (여러 개) */
export const EXCLUDE = {
  SPICY: '매운 음식',
  RAW: '날것 · 회',
  BAR: '술집 분위기',
  LONG_WAIT: '웨이팅 긴 곳',
} as const;

/** 중요해요 (최대 5개) */
export const IMPORTANT = {
  SPACIOUS: '좌석 넓음',
  ROOM: '룸 · 단체석',
  PARKING: '주차',
  QUIET: '조용함',
  KIND: '친절',
  SOLO_FRIENDLY: '혼밥 편함',
  VALUE: '가성비',
  FAST: '빨리 나옴',
} as const;

export const MAX_IMPORTANT = 5;

export type Who = keyof typeof WHO;
export type When = keyof typeof WHEN;
export type ExcludeCode = keyof typeof EXCLUDE;
export type Important = keyof typeof IMPORTANT;

const keys = <T extends object>(o: T) =>
  Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
export const WHO_CODES = keys(WHO);
export const WHEN_CODES = keys(WHEN);
export const EXCLUDE_CODES = keys(EXCLUDE);
export const IMPORTANT_CODES = keys(IMPORTANT);

/** 요청·응답의 조건. 빼기·중요해요는 중복 없이 목록 순서대로 */
export const conditionsSchema = z.object({
  who: z.enum(WHO_CODES).nullable().default(null),
  when: z.enum(WHEN_CODES).nullable().default(null),
  exclude: z
    .array(z.enum(EXCLUDE_CODES))
    .default([])
    .transform((v) => EXCLUDE_CODES.filter((c) => v.includes(c))),
  important: z
    .array(z.enum(IMPORTANT_CODES))
    .default([])
    .transform((v) => IMPORTANT_CODES.filter((c) => v.includes(c)))
    .refine((v) => v.length <= MAX_IMPORTANT),
});

export type Conditions = z.output<typeof conditionsSchema>;

export const EMPTY_CONDITIONS: Conditions = { who: null, when: null, exclude: [], important: [] };

export const conditionCount = (c: Conditions) =>
  (c.who ? 1 : 0) + (c.when ? 1 : 0) + c.exclude.length + c.important.length;

/** 문장에 중요해요가 없을 때 누구랑에 따라 보통 중요한 것 (피그마: 부모님 → 좌석·조용함·친절·주차). 값 목록 순서로 둔다 */
export const DEFAULT_IMPORTANT: Record<Who, Important[]> = {
  FAMILY: ['SPACIOUS', 'PARKING', 'QUIET', 'KIND'],
  KIDS: ['SPACIOUS', 'PARKING', 'KIND'],
  GROUP: ['ROOM', 'SPACIOUS'],
  COUPLE: ['QUIET'],
  SOLO: ['SOLO_FRIENDLY', 'FAST'],
  FRIEND: ['VALUE'],
};

const WITH: Record<Who, string> = {
  SOLO: '혼자',
  FRIEND: '친구와',
  COUPLE: '연인과',
  FAMILY: '가족과',
  KIDS: '아이와',
  GROUP: '단체',
};

/** 결과 화면 제목. 예) 가족과 주말 점심, 혼자 평일 점심, 저녁 회식, 늦은 밤 한 끼 */
export function titleOf({ who, when }: Conditions) {
  if (who === 'GROUP') return when ? `${WHEN[when]} 회식` : '회식할 곳';
  if (who && when) return `${WITH[who]} ${WHEN[when]}`;
  if (who) return who === 'SOLO' ? '혼밥할 곳' : `${WITH[who]} 갈 곳`;
  if (when) return `${WHEN[when]} 한 끼`;
  return '내 상황 맞춤';
}
