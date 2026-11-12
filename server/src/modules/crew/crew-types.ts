// 모임 종류·인원·배지 (피그마 12. 모임, 팀 공유 4장)

export type CrewType = 'F' | 'A' | 'C';

export const CREW_TYPE_API = { F: 'FRIEND', A: 'FAMILY', C: 'COUPLE' } as const;
export const CREW_TYPE_NAME: Record<CrewType, string> = { F: '친구', A: '가족', C: '연인' };
export const CREW_TYPE_OF = { FRIEND: 'F', FAMILY: 'A', COUPLE: 'C' } as const;
/** 최대 인원 (참여 중 + 수락 대기): 친구·가족 8명, 연인 2명 */
export const CREW_MAX: Record<CrewType, number> = { F: 8, A: 8, C: 2 };

/** 함께 정복으로 묶는 시간 (같은 가게, 같은 날, 이 안에 인증) */
export const TOGETHER_WINDOW_MS = 2 * 60 * 60 * 1000;

export const CREW_QUEST_NAME = { TOGETHER: '함께 정복', SPLIT: '맛집 나눠 찾기' } as const;
export type CrewQuestType = keyof typeof CREW_QUEST_NAME;
/** 모임 퀘스트 보상 (모임원 각자, reward_policy, 숫자는 나중에 조정) */
export const CREW_QUEST_REASON: Record<CrewQuestType, string> = {
  TOGETHER: 'CREW_TOGETHER',
  SPLIT: 'CREW_SPLIT',
};
export const CREW_QUEST_DEFAULT_POINT: Record<CrewQuestType, number> = { TOGETHER: 100, SPLIT: 80 };

/** 모임 배지: 함께 정복 수로 받는다. itemCode가 있으면 그때 모임원 모두 그 아이템도 받는다 */
export const CREW_BADGES = [
  { code: 'FIRST_FEAST', target: 1, itemCode: null },
  { code: 'EXPLORERS', target: 5, itemCode: null },
  { code: 'REGULARS', target: 10, itemCode: 'HAT_CREW' },
] as const;

/** 배지 이름: 탐험대는 모임 동네 이름을 붙인다 (강서구 → 강서 탐험대) */
export function badgeName(code: string, sigunguName: string) {
  if (code === 'FIRST_FEAST') return '첫 만찬';
  if (code === 'EXPLORERS') return `${sigunguName.replace(/구$/, '')} 탐험대`;
  if (code === 'REGULARS') return '단골 모임';
  return code;
}
