import type {
  Conditions,
  Craving,
  ExcludeCode,
  Important,
  Weather,
  When,
  Who,
} from '../api/situation';

// 상황 조건 값 목록 — 서버 situation-conditions.ts와 같은 순서·이름 (③ 시트의 칩)

export const WHO_OPTIONS: { value: Who; label: string }[] = [
  { value: 'SOLO', label: '혼자' },
  { value: 'FRIEND', label: '친구' },
  { value: 'COUPLE', label: '연인' },
  { value: 'FAMILY', label: '가족 · 부모님' },
  { value: 'KIDS', label: '아이와' },
  { value: 'GROUP', label: '단체 · 회식' },
];

export const WHEN_OPTIONS: { value: When; label: string }[] = [
  { value: 'WEEKDAY_LUNCH', label: '평일 점심' },
  { value: 'WEEKEND_LUNCH', label: '주말 점심' },
  { value: 'DINNER', label: '저녁' },
  { value: 'LATE_NIGHT', label: '늦은 밤' },
];

export const WEATHER_OPTIONS: { value: Weather; label: string }[] = [
  { value: 'RAINY', label: '비 오는 날' },
  { value: 'COLD', label: '추운 날' },
  { value: 'HOT', label: '더운 날' },
];

export const CRAVING_OPTIONS: { value: Craving; label: string }[] = [
  { value: 'SOUP', label: '국물' },
  { value: 'NOODLE', label: '면' },
  { value: 'MEAT', label: '고기' },
  { value: 'RICE', label: '든든한 밥' },
  { value: 'SEAFOOD', label: '해산물' },
  { value: 'LIGHT', label: '가볍게' },
  { value: 'DESSERT', label: '디저트 · 카페' },
];

export const EXCLUDE_OPTIONS: { value: ExcludeCode; label: string }[] = [
  { value: 'SPICY', label: '매운 음식' },
  { value: 'RAW', label: '날것 · 회' },
  { value: 'BAR', label: '술집 분위기' },
  { value: 'LONG_WAIT', label: '웨이팅 긴 곳' },
];

/** short: 결과 화면 칩 "좌석·조용함·친절·주차" */
export const IMPORTANT_OPTIONS: { value: Important; label: string; short: string }[] = [
  { value: 'SPACIOUS', label: '좌석 넓음', short: '좌석' },
  { value: 'ROOM', label: '룸 · 단체석', short: '룸' },
  { value: 'PARKING', label: '주차', short: '주차' },
  { value: 'QUIET', label: '조용함', short: '조용함' },
  { value: 'KIND', label: '친절', short: '친절' },
  { value: 'SOLO_FRIENDLY', label: '혼밥 편함', short: '혼밥' },
  { value: 'VALUE', label: '가성비', short: '가성비' },
  { value: 'FAST', label: '빨리 나옴', short: '빨리' },
];

export const MAX_IMPORTANT = 5;
export const MAX_CRAVING = 3;
export const MAX_SITUATION_TEXT = 60;

export const EMPTY_CONDITIONS: Conditions = {
  who: null,
  when: null,
  weather: null,
  craving: [],
  exclude: [],
  important: [],
};

/** 서버가 준 조건을 빈 칸 없이 (옛 응답에 없는 칸은 비운다) */
export const normalizeConditions = (c: Partial<Conditions>): Conditions => ({
  ...EMPTY_CONDITIONS,
  ...c,
});

export const labelOf = <T extends string>(options: { value: T; label: string }[], value: T) =>
  options.find((o) => o.value === value)?.label ?? value;

export const conditionCount = (c: Conditions) =>
  (c.who ? 1 : 0) +
  (c.when ? 1 : 0) +
  (c.weather ? 1 : 0) +
  c.craving.length +
  c.exclude.length +
  c.important.length;

/** 값 목록 순서로 정리 (서버 응답과 같은 순서) */
export function sortConditions(c: Conditions): Conditions {
  return {
    ...c,
    craving: CRAVING_OPTIONS.map((o) => o.value).filter((v) => c.craving.includes(v)),
    exclude: EXCLUDE_OPTIONS.map((o) => o.value).filter((v) => c.exclude.includes(v)),
    important: IMPORTANT_OPTIONS.map((o) => o.value).filter((v) => c.important.includes(v)),
  };
}

/** 입력 예시 (누르면 바로 조건 읽기, 피그마 3) */
export const SITUATION_EXAMPLES = [
  '부모님 모시고',
  '조용히 데이트',
  '혼밥 빠르게',
  '10명 회식',
  '비 오는 날 국물',
];

/** ⑤ 조건을 찾지 못했을 때 예시 (피그마 3-4) */
export const RETRY_EXAMPLES = [
  '친구랑 저녁, 웨이팅 없는 곳',
  '혼자 점심, 빨리 나오는 곳',
  '비 오는 날 국물',
];
