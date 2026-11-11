// 맞춤 퀘스트 종류·난이도 (피그마 12. 맞춤 퀘스트, 팀 공유 "개인화 · 맞춤 퀘스트 · 모임" 3장)

export type QuestLevel = 'E' | 'X' | 'C';

export const LEVEL_API = { E: 'EASY', X: 'EXPLORE', C: 'CHALLENGE' } as const;
export const LEVEL_NAME: Record<QuestLevel, string> = { E: '쉬움', X: '탐험', C: '도전' };
/** 깨면 주는 먹포인트 (reward_policy, 숫자는 나중에 조정) */
export const LEVEL_REWARD_REASON: Record<QuestLevel, string> = {
  E: 'QUEST_EASY',
  X: 'QUEST_EXPLORE',
  C: 'QUEST_CHALLENGE',
};

export type QuestType =
  | 'NEW_TASTE'
  | 'MY_STANDARD'
  | 'WIDEN_MENU'
  | 'LOCAL_PICK'
  | 'NEXT_DONG'
  | 'TIER_UP'
  | 'FIRST_REVIEWER'
  | 'SAVED_VISIT';

export const TYPE_NAME: Record<QuestType, string> = {
  NEW_TASTE: '새 맛 탐험',
  MY_STANDARD: '내 기준 맛집',
  WIDEN_MENU: '메뉴 넓히기',
  LOCAL_PICK: '동네 새 가게',
  NEXT_DONG: '옆 동네 한 바퀴',
  TIER_UP: '티어 도전',
  FIRST_REVIEWER: '첫 평가자',
  SAVED_VISIT: '저장한 곳 가기',
};

export const TYPE_LEVEL: Record<QuestType, QuestLevel> = {
  NEW_TASTE: 'X',
  MY_STANDARD: 'X',
  WIDEN_MENU: 'X',
  LOCAL_PICK: 'X',
  NEXT_DONG: 'C',
  TIER_UP: 'C',
  FIRST_REVIEWER: 'E',
  SAVED_VISIT: 'E',
};

/** 이번 주 퀘스트 수와 난이도 (지난 4주 평균 방문): 주 0~1회 2개 / 2~3회 3개 / 4회 이상 4개 */
export function weekPlan(visitsIn4Weeks: number) {
  const perWeek = visitsIn4Weeks / 4;
  if (perWeek >= 4) return { activity: 'H' as const, levels: ['E', 'X', 'C', 'C'] as QuestLevel[] };
  if (perWeek >= 2) return { activity: 'M' as const, levels: ['E', 'X', 'C'] as QuestLevel[] };
  return { activity: 'L' as const, levels: ['E', 'X'] as QuestLevel[] };
}

export const ACTIVITY_API = { L: 'LOW', M: 'MEDIUM', H: 'HIGH' } as const;
export const ACTIVITY_NAME = { L: '활동 적음', M: '활동 보통', H: '활동 많음' } as const;

/** "단골 국밥집 말고 새 국밥집"의 가게 말 — 카테고리 이름 뒤에 붙일 말 */
const PLACE_WORD: Record<string, string> = {
  한식: '한식집',
  중식: '중식집',
  일식: '일식집',
  양식: '양식집',
  분식: '분식집',
  고깃집: '고깃집',
  해산물: '해산물집',
  치킨: '치킨집',
  패스트푸드: '패스트푸드점',
  아시안: '아시안 음식점',
  '카페·디저트': '카페',
};

export function placeWord(categoryName: string | null | undefined) {
  if (!categoryName) return '가게';
  return PLACE_WORD[categoryName] ?? `${categoryName} 가게`;
}

/** 중요 항목 이름 (내 취향) */
export const TASTE_LABEL = {
  taste: '맛',
  cleanliness: '청결',
  portion: '양',
  service: '서비스',
  price: '가격',
} as const;
