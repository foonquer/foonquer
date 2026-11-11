import type { Tx } from '../../common/db';
import { kstWeekStartAsDbDate } from '../../common/time';
import {
  checkAchievements,
  questStreak,
  type UnlockedAchievement,
} from '../achievement/achievement.service';
import { addPoint } from '../reward/reward.service';
import { draftQuest, insertQuest, loadProfile } from './quest-generate';
import {
  LEVEL_NAME,
  LEVEL_REWARD_REASON,
  type QuestLevel,
  type QuestType,
  TYPE_NAME,
} from './quest-types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface QuestAdvance {
  /** 이번 정복으로 깬 퀘스트 */
  completed: {
    questId: bigint;
    typeName: string;
    levelName: string;
    title: string;
    rewardPoint: number;
    isBonus: boolean;
  }[];
  week: {
    baseCount: number;
    doneCount: number;
    /** 이번에 기본 퀘스트를 모두 깨서 받은 주간 아이템 상자 (아니면 null) */
    boxId: bigint | null;
    /** 이번 주 퀘스트를 모두 깬 주가 몇 주 이어지는지 */
    streak: number;
  };
  /** 이번 주 퀘스트를 모두 깨서 열린 보너스 퀘스트 */
  bonusQuest: {
    questId: bigint;
    typeName: string;
    title: string;
    summary: string;
    rewardPoint: number;
  } | null;
  /** 퀘스트 업적 (꾸준한 탐험가, 새 맛 수집가) */
  achievements: UnlockedAchievement[];
}

/**
 * 별점 등록(REVIEW-01) 때 이번 주 퀘스트를 진행한다 (정복과 같은 트랜잭션).
 * 완료 조건 = 방문 인증 + 맛 별점 (리뷰 글은 선택). 퀘스트를 깨지 않았으면 null.
 * - 가게 퀘스트: 그 가게
 * - 옆 동네 한 바퀴: 그 동에서 처음 가 보는 가게
 * - 티어 도전: 이번 시즌 내 동네 구에서 새로 정복한 가게
 * 기본 퀘스트를 모두 깨면 주간 아이템 상자, 보너스 퀘스트까지 모두 깨면 보너스 퀘스트 1개 더.
 * 보상은 별점 값과 상관없이 준다 ("좋게 써야 보상"이 되면 신뢰 별점이 무너지니까)
 */
export async function advanceQuests(
  tx: Tx,
  input: {
    userId: bigint;
    restaurantId: bigint;
    isNewConquest: boolean;
    isFirstEver: boolean;
    now: Date;
  },
): Promise<QuestAdvance | null> {
  const { userId, restaurantId, now } = input;
  const weekStart = kstWeekStartAsDbDate(now);
  const week = await tx.questWeek.findUnique({
    where: { userId_weekStart: { userId, weekStart } },
  });
  if (!week) return null;
  const [member, place, home, active] = await Promise.all([
    tx.member.findUniqueOrThrow({ where: { id: userId }, select: { questEnabled: true } }),
    tx.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { regionId: true, sigunguId: true },
    }),
    tx.memberLocalRegion.findFirst({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
      select: { sigunguId: true },
    }),
    tx.quest.findMany({ where: { weekId: week.id, status: 'A' }, orderBy: { id: 'asc' } }),
  ]);
  if (!member.questEnabled) return null;

  const completed: QuestAdvance['completed'] = [];
  for (const q of active) {
    const hit = q.restaurantId
      ? q.restaurantId === restaurantId
      : q.type === 'NEXT_DONG'
        ? q.regionId === place.regionId && input.isFirstEver
        : q.type === 'TIER_UP' && input.isNewConquest && home?.sigunguId === place.sigunguId;
    if (!hit) continue;
    const progress = Math.min(q.progress + 1, q.target);
    const done = progress >= q.target;
    await tx.quest.update({
      where: { id: q.id },
      data: done
        ? { progress, status: 'C', completedAt: now, doneRestaurantId: restaurantId }
        : { progress },
    });
    if (!done) continue;
    const level = q.level as QuestLevel;
    const typeName = TYPE_NAME[q.type as QuestType] ?? q.type;
    await addPoint(
      tx,
      userId,
      q.rewardPoint,
      LEVEL_REWARD_REASON[level],
      `퀘스트 완료 · ${typeName}`,
      { type: 'QUEST', id: q.id },
      now,
    );
    completed.push({
      questId: q.id,
      typeName,
      levelName: LEVEL_NAME[level],
      title: q.title,
      rewardPoint: q.rewardPoint,
      isBonus: q.isBonus,
    });
  }
  if (completed.length === 0) return null;

  const all = await tx.quest.findMany({
    where: { weekId: week.id, status: { in: ['A', 'C'] } },
    select: { isBonus: true, status: true },
  });
  const base = all.filter((q) => !q.isBonus);
  const achievements: UnlockedAchievement[] = [];
  let boxId: bigint | null = null;
  if (week.completedAt === null && base.length > 0 && base.every((q) => q.status === 'C')) {
    await tx.questWeek.update({ where: { id: week.id }, data: { completedAt: now } });
    const box = await tx.memberItemBox.create({
      data: {
        userId,
        source: 'QUEST_WEEK',
        sourceRef: Math.floor(weekStart.getTime() / WEEK_MS),
        regDate: now,
      },
    });
    boxId = box.id;
    achievements.push(...(await checkAchievements(tx, userId, ['QUEST_STREAK'], null, now)));
  }
  achievements.push(...(await checkAchievements(tx, userId, ['QUEST_PLACES'], null, now)));

  // 이번 주 퀘스트(보너스 포함)를 모두 깼으면 보너스 퀘스트 1개 더 (첫 평가자 같은 쉬운 것)
  let bonusQuest: QuestAdvance['bonusQuest'] = null;
  if (all.every((q) => q.status === 'C')) {
    const profile = await loadProfile(tx, userId, weekStart, now);
    const picked = profile
      ? await draftQuest(tx, profile, 'E', all.length + 1, new Set<QuestType>(['SAVED_VISIT']))
      : null;
    if (profile && picked) {
      const q = await insertQuest(tx, profile, week.id, picked, true);
      bonusQuest = {
        questId: q.id,
        typeName: TYPE_NAME[q.type as QuestType] ?? q.type,
        title: q.title,
        summary: q.summary,
        rewardPoint: q.rewardPoint,
      };
    }
  }
  return {
    completed,
    week: {
      baseCount: base.length,
      doneCount: base.filter((q) => q.status === 'C').length,
      boxId,
      streak: await questStreak(tx, userId, now),
    },
    bonusQuest,
    achievements,
  };
}
