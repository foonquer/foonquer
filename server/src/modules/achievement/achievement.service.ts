import type { Db, Tx } from '../../common/db';
import { objectParticle, withObjectParticle } from '../../common/josa';
import { notify } from '../notification/notify';
import { addPoint } from '../reward/reward.service';

// 업적 (ERD achievement.condition_type, 기본 데이터 12개). 정복·리뷰·도움돼요가 생길 때 해당 종류만 다시 센다.
// SEASON_RANK(시즌 TOP 10·먹짱)는 시즌 확정 때 따로 준다(grantSeasonRankAchievements).

export type ConditionType =
  | 'CONQUEST_TOTAL'
  | 'SIGUNGU_CONQUEST'
  | 'DISTRICT_COUNT'
  | 'SEASON_CONQUEST'
  | 'WEEKLY_STREAK'
  | 'REVIEW_TEXT_COUNT'
  | 'REVIEW_PHOTO_COUNT'
  | 'HELPFUL_RECEIVED'
  | 'SEASON_RANK';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** KST 월요일 0시 기준 주 번호 */
function weekIndex(date: Date) {
  // 1970-01-01(목)에서 3일 당겨 월요일 시작으로 맞춘다
  return Math.floor((date.getTime() + KST_OFFSET_MS + 3 * 24 * 60 * 60 * 1000) / WEEK_MS);
}

/** 이번 주부터 거꾸로 매주 1곳 이상 정복한 주가 몇 주 이어지는지 (이번 주에 아직 없으면 지난주부터 센다) */
async function weeklyStreak(db: Db, userId: bigint, now: Date) {
  const rows = await db.conquest.findMany({ where: { userId }, select: { conqueredAt: true } });
  const weeks = new Set(rows.map((r) => weekIndex(r.conqueredAt)));
  let week = weekIndex(now);
  if (!weeks.has(week)) week -= 1;
  let streak = 0;
  while (weeks.has(week)) {
    streak += 1;
    week -= 1;
  }
  return streak;
}

/** 업적 하나의 지금 진행 값 (RANK-08 진행도에도 쓴다) */
export async function progressOf(
  db: Db,
  userId: bigint,
  type: string,
  now = new Date(),
): Promise<number> {
  switch (type as ConditionType) {
    case 'CONQUEST_TOTAL': {
      const rows = await db.conquest.findMany({
        where: { userId },
        distinct: ['restaurantId'],
        select: { restaurantId: true },
      });
      return rows.length;
    }
    case 'SIGUNGU_CONQUEST': {
      const rows = await db.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT restaurant_id) AS n FROM conquest WHERE user_id = ${userId}
        GROUP BY sigungu_id ORDER BY n DESC LIMIT 1`;
      return Number(rows[0]?.n ?? 0);
    }
    case 'DISTRICT_COUNT': {
      const rows = await db.conquest.findMany({
        where: { userId },
        distinct: ['sigunguId'],
        select: { sigunguId: true },
      });
      return rows.length;
    }
    case 'SEASON_CONQUEST': {
      const rows = await db.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM conquest WHERE user_id = ${userId}
        GROUP BY season_id ORDER BY n DESC LIMIT 1`;
      return Number(rows[0]?.n ?? 0);
    }
    case 'WEEKLY_STREAK':
      return weeklyStreak(db, userId, now);
    case 'REVIEW_TEXT_COUNT':
      return db.review.count({ where: { userId, status: 'A', content: { not: null } } });
    case 'REVIEW_PHOTO_COUNT':
      return db.review.count({ where: { userId, status: 'A', imageCount: { gt: 0 } } });
    case 'HELPFUL_RECEIVED': {
      const sum = await db.review.aggregate({
        where: { userId, status: 'A' },
        _sum: { helpfulCount: true },
      });
      return sum._sum.helpfulCount ?? 0;
    }
    case 'SEASON_RANK': {
      // 확정된 시즌에서 가장 높았던 순위 (값이 작을수록 좋다) — 진행도는 "달성/미달성"만 본다
      const best = await db.seasonRegionStat.findFirst({
        where: { userId, isFinalized: true, rankNo: { not: null } },
        orderBy: { rankNo: 'asc' },
        select: { rankNo: true },
      });
      return best?.rankNo ?? 0;
    }
    default:
      return 0;
  }
}

/** 조건을 채웠는지 (SEASON_RANK는 순위가 목표값 이하) */
export function isReached(type: string, progress: number, target: number) {
  if (type === 'SEASON_RANK') return progress > 0 && progress <= target;
  return progress >= target;
}

export interface UnlockedAchievement {
  achievementId: number;
  code: string;
  name: string;
  rewardPoint: number;
  /** 업적 보상으로 받은 아이템 (왕관·밤하늘 먹깨비·황금 방망이) */
  rewardItems: { itemId: number; code: string; name: string }[];
}

async function unlock(
  tx: Tx,
  userId: bigint,
  achievement: { id: number; code: string; name: string; rewardPoint: number },
  seasonId: number | null,
  now: Date,
): Promise<UnlockedAchievement | null> {
  const created = await tx.memberAchievement.createMany({
    data: [{ userId, achievementId: achievement.id, seasonId, achievedAt: now }],
    skipDuplicates: true,
  });
  if (created.count === 0) return null;
  await addPoint(
    tx,
    userId,
    achievement.rewardPoint,
    'ACHIEVEMENT',
    `업적 달성 · ${achievement.name}`,
    { type: 'ACHIEVEMENT', id: achievement.id },
    now,
  );
  await notify(
    tx,
    userId,
    {
      category: 'MUKKAEBI',
      type: 'ACHIEVEMENT',
      title: `업적 '${achievement.name}'${objectParticle(achievement.name)} 달성했어요!`,
      content:
        achievement.rewardPoint > 0
          ? `보상 +${achievement.rewardPoint}P를 받았어요`
          : '칭호로 쓸 수 있어요',
      refType: 'ACHIEVEMENT',
      refId: achievement.id,
    },
    now,
  );
  const rewardItems = await giveAchievementItems(tx, userId, achievement.id, now);
  return {
    achievementId: achievement.id,
    code: achievement.code,
    name: achievement.name,
    rewardPoint: achievement.rewardPoint,
    rewardItems,
  };
}

/**
 * 업적 보상 아이템 (v1.3): item.required_achievement_id가 이 업적인 아이템을 준다.
 * 방망이는 개수 +1, 나머지(왕관·밤하늘)는 이미 가졌으면 그대로 둔다(개수는 항상 1)
 */
async function giveAchievementItems(tx: Tx, userId: bigint, achievementId: number, now: Date) {
  const candidates = await tx.item.findMany({
    where: { requiredAchievementId: achievementId, status: 'A' },
    select: { id: true, code: true, name: true, category: true },
  });
  const items: typeof candidates = [];
  for (const item of candidates) {
    const owned = await tx.memberItem.findUnique({
      where: { userId_itemId: { userId, itemId: item.id } },
      select: { quantity: true },
    });
    if (owned && owned.quantity > 0 && item.category !== 'CLUB') continue;
    await tx.memberItem.upsert({
      where: { userId_itemId: { userId, itemId: item.id } },
      update: { quantity: { increment: 1 }, seenAt: null },
      create: { userId, itemId: item.id, acquiredType: 'A', acquiredAt: now },
    });
    items.push(item);
    await notify(
      tx,
      userId,
      {
        category: 'MUKKAEBI',
        type: 'NEW_ITEM',
        title: `${withObjectParticle(item.name)} 얻었어요!`,
        content: '업적 보상이에요. 꾸미기에서 착용해 보세요',
        refType: 'ITEM',
        refId: item.id,
      },
      now,
    );
  }
  return items.map((i) => ({ itemId: i.id, code: i.code, name: i.name }));
}

/**
 * 아직 달성하지 않은 업적 중 types에 해당하는 것만 다시 세어 달성하면 기록·보상·알림을 남긴다.
 * @returns 이번에 새로 달성한 업적 (축하 화면용)
 */
export async function checkAchievements(
  tx: Tx,
  userId: bigint,
  types: ConditionType[],
  seasonId: number | null,
  now = new Date(),
): Promise<UnlockedAchievement[]> {
  const candidates = await tx.achievement.findMany({
    where: {
      status: 'A',
      conditionType: { in: types },
      memberAchievements: { none: { userId } },
    },
    orderBy: { sortOrder: 'asc' },
  });
  const unlocked: UnlockedAchievement[] = [];
  const progress = new Map<string, number>();
  for (const a of candidates) {
    if (!progress.has(a.conditionType)) {
      progress.set(a.conditionType, await progressOf(tx, userId, a.conditionType, now));
    }
    if (!isReached(a.conditionType, progress.get(a.conditionType) ?? 0, a.conditionValue)) continue;
    const done = await unlock(tx, userId, a, seasonId, now);
    if (done) unlocked.push(done);
  }
  return unlocked;
}

/** 시즌 확정 때: 그 시즌 한 구에서 가장 높았던 최종 순위로 SEASON_RANK 업적(TOP 10·먹짱)을 준다 */
export async function grantSeasonRankAchievements(
  tx: Tx,
  userId: bigint,
  seasonId: number,
  bestRank: number,
  now = new Date(),
) {
  const candidates = await tx.achievement.findMany({
    where: { status: 'A', conditionType: 'SEASON_RANK', memberAchievements: { none: { userId } } },
  });
  const unlocked: UnlockedAchievement[] = [];
  for (const a of candidates) {
    if (bestRank > a.conditionValue) continue;
    const done = await unlock(tx, userId, a, seasonId, now);
    if (done) unlocked.push(done);
  }
  return unlocked;
}
