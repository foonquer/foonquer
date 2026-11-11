// 맞춤 퀘스트 API (QUEST-01~06, 피그마 12. 맞춤 퀘스트)

import { api } from '../lib/api';

export type QuestLevel = 'EASY' | 'EXPLORE' | 'CHALLENGE';

export type Quest = {
  questId: number;
  type: string;
  typeName: string;
  level: QuestLevel;
  levelName: string;
  title: string;
  /** 목록 셋째 줄 (예: 최근 한 달 방문의 70%가 같은 국밥집이에요) */
  summary: string;
  /** "왜 나에게 왔나요?" */
  reasons: string[];
  target: number;
  progress: number;
  rewardPoint: number;
  isBonus: boolean;
  status: 'ACTIVE' | 'DONE';
  completedAt: string | null;
  /** 가 볼 가게 (옆 동네 한 바퀴·티어 도전은 null) */
  restaurant: {
    restaurantId: number;
    name: string;
    categoryName: string | null;
    regionName: string | null;
    /** 내 동네 동 중심에서 거리 (m) */
    distanceM: number | null;
    tasteScore: number | null;
    myOverallScore: number | null;
    isConquered: boolean;
  } | null;
  /** 옆 동네 한 바퀴: 새로 정복할 동 */
  region: { regionId: number; name: string } | null;
};

export type QuestWeek = {
  weekId: number;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  /** 남은 날 (일요일이 0) */
  daysLeft: number;
  activity: 'LOW' | 'MEDIUM' | 'HIGH';
  activityName: string;
  baseCount: number;
  doneCount: number;
  bonusDoneCount: number;
  swapAvailable: boolean;
  boxReceived: boolean;
};

export type CurrentQuests = {
  /** 설정에서 맞춤 퀘스트를 껐으면 false */
  enabled: boolean;
  /** 내 동네가 없으면 null */
  week: QuestWeek | null;
  quests: Quest[];
  /** 이번 주 퀘스트를 모두 깬 주가 몇 주 이어지는지 */
  streak: number;
};

/** QUEST-01 이번 주 퀘스트 (처음 열면 만든다) */
export const getCurrentQuests = () => api.get<CurrentQuests>('/quests/current');

export type QuestDetail = Quest & {
  week: QuestWeek;
  /** 이 퀘스트를 깨면 주간 상자까지 남는 수 (보너스·이미 받은 주는 null) */
  boxRemaining: number | null;
  /** 바꾸기·관심 없어요를 쓸 수 있는지 (이번 주 진행 전 퀘스트) */
  canChange: boolean;
};

/** QUEST-02 퀘스트 상세 */
export const getQuest = (questId: number) => api.get<QuestDetail>(`/quests/${questId}`);

/** QUEST-03 다른 퀘스트로 바꾸기 (주 1번) */
export const swapQuest = (questId: number) => api.post<Quest>(`/quests/${questId}/swap`);

/** QUEST-04 관심 없어요 */
export const dismissQuest = (questId: number) => api.post<Quest>(`/quests/${questId}/dismiss`);

export type QuestGoal = { name: string; target: number; achieved: boolean };

export type QuestRecords = {
  streak: number;
  thisWeekDone: boolean;
  streakGoal: QuestGoal | null;
  placesGoal: QuestGoal | null;
  completedCount: number;
  placeCount: number;
  pointTotal: number;
  weeks: QuestWeek[];
};

/** QUEST-05 퀘스트 기록 */
export const getQuestRecords = () => api.get<QuestRecords>('/quests/records');

/** QUEST-06 지난 주 퀘스트 */
export const getQuestWeek = (weekId: number) =>
  api.get<{ week: QuestWeek; quests: Quest[] }>(`/quests/weeks/${weekId}`);

/** 별점 등록(REVIEW-01) 응답의 quest — 이번 정복으로 깬 퀘스트 */
export type QuestAdvance = {
  completed: {
    questId: number;
    typeName: string;
    levelName: string;
    title: string;
    rewardPoint: number;
    isBonus: boolean;
  }[];
  week: { baseCount: number; doneCount: number; boxId: number | null; streak: number };
  bonusQuest: {
    questId: number;
    typeName: string;
    title: string;
    summary: string;
    rewardPoint: number;
  } | null;
  achievements: { name: string; rewardPoint: number }[];
};
