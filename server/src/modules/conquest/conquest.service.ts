import type { Tx } from '../../common/db';
import { checkAchievements, type UnlockedAchievement } from '../achievement/achievement.service';
import { notify } from '../notification/notify';
import {
  nextTierIn,
  recomputeSigunguRanking,
  TIER_API,
  TIER_NAME,
  TIER_ORDER,
  type TierCode,
  tierTitle,
} from '../ranking/tier';
import { grantReward, type RewardResult, sumRewards } from '../reward/reward.service';

/** 한 구에서 서로 다른 가게를 이만큼 정복하면 그 구의 특색 배경을 얻는다 (모든 시즌 누적, ERD member_region_background 초안) */
export const BACKGROUND_UNLOCK_COUNT = 10;

export interface ConquestResult {
  /** 이번 시즌 이 가게를 처음 정복했는지 (같은 시즌에 다시 가면 false — 순위에 다시 세지 않는다) */
  isNewConquest: boolean;
  /** 이 가게를 처음 정복했는지 (모든 시즌) — 새 가게 첫 정복 +100P */
  isFirstEver: boolean;
  sigungu: { sigunguId: number; sigunguName: string };
  /** 이번 시즌 그 구의 내 기록 (진행 중 시즌이 없으면 null) */
  stat: {
    conquestCount: number;
    rank: number | null;
    /** 이번 정복 전 순위 (이 구에서 이번 시즌 첫 정복이면 null) — 정복 완료 "8위 → 7위" */
    previousRank: number | null;
    topPercent: number | null;
    tier: string;
    tierTitle: string;
    /** 다음 티어와 남은 정복 수 (정복자·먹짱은 순위로 정해져서 remaining이 null) */
    nextTier: { tierName: string; remaining: number | null } | null;
  } | null;
  tierUp: { from: string; to: string; tierTitle: string } | null;
  backgroundUnlocked: { sigunguId: number; sigunguName: string; bgKey: string | null } | null;
  achievements: UnlockedAchievement[];
  rewards: RewardResult;
}

/**
 * 별점 등록(REVIEW-01) 때 정복을 반영한다 (한 트랜잭션 안에서).
 * conquest, season_region_stat(+순위·티어 다시 계산), 티어 상승 보상·알림, 새 가게 첫 정복 보상,
 * 먹깨비 위치, 구 배경 해금, 정복 업적을 한 번에 처리한다.
 */
export async function applyConquest(
  tx: Tx,
  input: {
    userId: bigint;
    visitId: bigint;
    restaurant: { id: bigint; name: string; sigunguId: number };
    seasonId: number | null;
    now: Date;
  },
): Promise<ConquestResult> {
  const { userId, restaurant, seasonId, now } = input;
  const sigungu = await tx.region.findUniqueOrThrow({
    where: { id: restaurant.sigunguId },
    select: { id: true, name: true, bgKey: true },
  });
  const rewards: RewardResult[] = [];
  let isNewConquest = false;
  let isFirstEver = false;
  let stat: ConquestResult['stat'] = null;
  let tierUp: ConquestResult['tierUp'] = null;

  if (seasonId !== null) {
    // 같은 구의 정복·순위 계산을 한 줄로 세운다 (둘이 동시에 1위·먹짱으로 저장되지 않게)
    await tx.$queryRaw`SELECT id FROM region WHERE id = ${restaurant.sigunguId} FOR UPDATE`;
    const before = await tx.seasonRegionStat.findUnique({
      where: { seasonId_sigunguId_userId: { seasonId, sigunguId: restaurant.sigunguId, userId } },
      select: { rankNo: true },
    });
    const existing = await tx.conquest.findUnique({
      where: {
        userId_restaurantId_seasonId: { userId, restaurantId: restaurant.id, seasonId },
      },
      select: { id: true },
    });
    if (!existing) {
      isNewConquest = true;
      isFirstEver =
        (await tx.conquest.count({ where: { userId, restaurantId: restaurant.id } })) === 0;
      await tx.conquest.create({
        data: {
          userId,
          restaurantId: restaurant.id,
          seasonId,
          sigunguId: restaurant.sigunguId,
          visitId: input.visitId,
          conqueredAt: now,
        },
      });
      await tx.seasonRegionStat.upsert({
        where: {
          seasonId_sigunguId_userId: { seasonId, sigunguId: restaurant.sigunguId, userId },
        },
        update: { conquestCount: { increment: 1 }, lastConqueredAt: now },
        create: {
          seasonId,
          sigunguId: restaurant.sigunguId,
          userId,
          conquestCount: 1,
          lastConqueredAt: now,
        },
      });
      const changes = await recomputeSigunguRanking(tx, seasonId, restaurant.sigunguId);
      for (const change of changes) {
        const up = TIER_ORDER[change.afterTier] > TIER_ORDER[change.beforeTier];
        if (change.userId === userId) {
          if (!up) continue;
          tierUp = {
            from: TIER_API[change.beforeTier],
            to: TIER_API[change.afterTier],
            tierTitle: tierTitle(sigungu.name, change.afterTier),
          };
          rewards.push(
            await grantReward(
              tx,
              userId,
              'TIER_UP',
              `${tierTitle(sigungu.name, change.afterTier)} 달성`,
              { type: `TIER:${change.afterTier}`, id: change.statId },
              now,
            ),
          );
          await notify(
            tx,
            userId,
            {
              category: 'RANK',
              type: change.afterTier === 'M' ? 'MUKJJANG' : 'TIER_UP',
              title:
                change.afterTier === 'M'
                  ? `${sigungu.name}의 먹짱이 됐어요!`
                  : `${tierTitle(sigungu.name, change.afterTier)}로 올랐어요!`,
              content: `${change.afterRank ?? '-'}위 · 시즌 기록에 남아요`,
              refType: 'SIGUNGU',
              refId: restaurant.sigunguId,
            },
            now,
          );
        } else if (
          (change.beforeTier === 'M' || change.beforeTier === 'C') &&
          TIER_ORDER[change.afterTier] < TIER_ORDER[change.beforeTier]
        ) {
          await notify(
            tx,
            change.userId,
            {
              category: 'RANK',
              type: 'TIER_DOWN',
              title:
                change.beforeTier === 'M'
                  ? `${sigungu.name} 먹짱 자리를 내줬어요`
                  : `${sigungu.name} ${TIER_NAME[change.afterTier]}로 내려갔어요`,
              content: `지금 ${change.afterRank ?? '-'}위 · 다시 정복해 볼까요?`,
              refType: 'SIGUNGU',
              refId: restaurant.sigunguId,
            },
            now,
          );
        }
      }
    }
    const mine = await tx.seasonRegionStat.findUnique({
      where: { seasonId_sigunguId_userId: { seasonId, sigunguId: restaurant.sigunguId, userId } },
    });
    if (mine) {
      const tier = mine.tier as TierCode;
      const next = await nextTierIn(
        tx,
        { seasonId, sigunguId: restaurant.sigunguId },
        tier,
        mine.conquestCount,
      );
      stat = {
        conquestCount: mine.conquestCount,
        rank: mine.rankNo,
        previousRank: before?.rankNo ?? null,
        topPercent: mine.topPercent?.toNumber() ?? null,
        tier: TIER_API[tier],
        tierTitle: tierTitle(sigungu.name, tier),
        nextTier: next ? { tierName: TIER_NAME[next.tier], remaining: next.remaining } : null,
      };
    }
  }

  if (isFirstEver) {
    rewards.push(
      await grantReward(
        tx,
        userId,
        'FIRST_CONQUEST',
        `${restaurant.name} 첫 정복`,
        { type: 'CONQUEST', id: input.visitId },
        now,
      ),
    );
  }

  // 지도 위 먹깨비 위치 = 마지막으로 정복한 가게
  const mukkaebi = await tx.mukkaebi.upsert({
    where: { userId },
    update: { currentRestaurantId: restaurant.id },
    create: { userId, currentRestaurantId: restaurant.id },
    select: { bgSigunguId: true },
  });

  let backgroundUnlocked: ConquestResult['backgroundUnlocked'] = null;
  if (isNewConquest) {
    const distinct = await tx.conquest.findMany({
      where: { userId, sigunguId: restaurant.sigunguId },
      distinct: ['restaurantId'],
      select: { restaurantId: true },
    });
    if (distinct.length >= BACKGROUND_UNLOCK_COUNT) {
      const created = await tx.memberRegionBackground.createMany({
        data: [{ userId, sigunguId: restaurant.sigunguId, unlockedAt: now }],
        skipDuplicates: true,
      });
      if (created.count > 0) {
        backgroundUnlocked = {
          sigunguId: sigungu.id,
          sigunguName: sigungu.name,
          bgKey: sigungu.bgKey,
        };
        // 처음 얻은 배경은 바로 골라 둔다 (초안)
        if (mukkaebi.bgSigunguId === null) {
          await tx.mukkaebi.update({ where: { userId }, data: { bgSigunguId: sigungu.id } });
        }
        await notify(
          tx,
          userId,
          {
            category: 'MUKKAEBI',
            type: 'NEW_ITEM',
            title: `${sigungu.name} 배경을 얻었어요!`,
            content: `${sigungu.name}에서 ${BACKGROUND_UNLOCK_COUNT}곳을 정복했어요 · 꾸미기에서 바꿀 수 있어요`,
            refType: 'SIGUNGU',
            refId: sigungu.id,
          },
          now,
        );
      }
    }
  }

  const achievements = isNewConquest
    ? await checkAchievements(
        tx,
        userId,
        [
          'CONQUEST_TOTAL',
          'SIGUNGU_CONQUEST',
          'DISTRICT_COUNT',
          'SEASON_CONQUEST',
          'WEEKLY_STREAK',
        ],
        seasonId,
        now,
      )
    : [];

  return {
    isNewConquest,
    isFirstEver,
    sigungu: { sigunguId: sigungu.id, sigunguName: sigungu.name },
    stat,
    tierUp,
    backgroundUnlocked,
    achievements,
    rewards: sumRewards(rewards),
  };
}
