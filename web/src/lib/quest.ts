// 맞춤 퀘스트 화면 공통 (가게 줄, 남은 날, 새 퀘스트 점)

import type { CurrentQuests, Quest } from '../api/quests';
import { formatDistance, formatScore, joinDot } from './format';

/** 가게 줄: "옛날순대국 · 내 종합 4.4 · 등촌동 650m" */
export function questPlaceLine(q: Quest) {
  const r = q.restaurant;
  if (!r) return null;
  return joinDot([
    r.name,
    r.myOverallScore !== null ? `내 종합 ${formatScore(r.myOverallScore)}` : null,
    [r.regionName, r.distanceM !== null ? formatDistance(r.distanceM) : null]
      .filter(Boolean)
      .join(' '),
  ]);
}

/** 남은 날: D-4, 일요일은 오늘까지 */
export const dDay = (daysLeft: number) => (daysLeft > 0 ? `D-${daysLeft}` : '오늘까지');

const SEEN_KEY = 'mk:quest-seen';

/** 이번 주 퀘스트를 열어 본 적 있는지 (새 퀘스트 점). 브라우저 저장소를 못 쓰면 항상 본 것으로 */
function seenKeyOf(data: CurrentQuests) {
  return data.week ? `${data.week.weekId}:${data.quests.map((q) => q.questId).join(',')}` : '';
}

export function hasNewQuests(data: CurrentQuests) {
  try {
    return localStorage.getItem(SEEN_KEY) !== seenKeyOf(data);
  } catch {
    return false;
  }
}

export function markQuestsSeen(data: CurrentQuests) {
  try {
    localStorage.setItem(SEEN_KEY, seenKeyOf(data));
  } catch {
    // 저장소를 못 쓰면 점만 계속 보인다
  }
}
