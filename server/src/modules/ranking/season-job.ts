import type { Tx } from '../../common/db';
import { addDays, kstTodayAsDbDate } from '../../common/time';
import { prisma } from '../../lib/prisma';
import { grantSeasonRankAchievements } from '../achievement/achievement.service';
import { notify } from '../notification/notify';
import { addPoint } from '../reward/reward.service';
import { recomputeSigunguRanking, TIER_ORDER, type TierCode, tierTitle } from './tier';

// 시즌 배치 (하루 1번, pnpm job season)
// 1. 끝난 시즌(A, end_date < 오늘)을 E(집계 중)로 바꾼다
// 2. E 시즌: 구마다 순위를 마지막으로 계산해 확정(is_finalized), 회원마다 season_result·보상(먹포인트·방망이·명예 아이템)·업적·알림, 시즌 F
// 3. 진행 중 시즌이 없으면 다음 시즌을 연다 (예정 시즌이 있으면 그것, 없으면 6개월짜리 새 시즌)

const SEASON_MONTHS = 6;

function addMonthsDb(date: Date, months: number) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** 시즌 보상표: 방망이는 걸린 것 중 가장 좋은 1개, 명예 아이템(왕관·밤하늘)은 모두 */
async function rewardItemsFor(tx: Tx, rank: number, topPercent: number) {
  const rules = await tx.seasonRewardRule.findMany({ include: { item: true } });
  const matched = rules.filter((r) =>
    r.ruleType === 'R' ? rank <= r.threshold.toNumber() : topPercent <= r.threshold.toNumber(),
  );
  const clubs = matched
    .filter((r) => r.item.category === 'CLUB')
    .sort((a, b) => (b.item.clubTier ?? 0) - (a.item.clubTier ?? 0));
  const honors = matched.filter((r) => r.item.category !== 'CLUB');
  return { club: clubs[0]?.item ?? null, honors: honors.map((h) => h.item) };
}

async function giveItem(tx: Tx, userId: bigint, itemId: number, seasonId: number, now: Date) {
  await tx.memberItem.upsert({
    where: { userId_itemId: { userId, itemId } },
    update: { quantity: { increment: 1 }, seenAt: null },
    create: { userId, itemId, acquiredType: 'S', seasonId, acquiredAt: now },
  });
}

/** 시즌 하나를 확정한다 (이미 F면 아무것도 하지 않음) */
export async function finalizeSeason(seasonId: number, now = new Date()) {
  const season = await prisma.season.findUniqueOrThrow({ where: { id: seasonId } });
  if (season.status === 'F') return { finalized: false, members: 0 };

  const sigungus = await prisma.seasonRegionStat.findMany({
    where: { seasonId },
    distinct: ['sigunguId'],
    select: { sigunguId: true },
  });
  for (const { sigunguId } of sigungus) {
    await prisma.$transaction((tx) => recomputeSigunguRanking(tx, seasonId, sigunguId));
  }
  await prisma.seasonRegionStat.updateMany({ where: { seasonId }, data: { isFinalized: true } });

  const policy = await prisma.rewardPolicy.findUnique({ where: { reason: 'SEASON_REWARD' } });
  const members = await prisma.seasonRegionStat.groupBy({
    by: ['userId'],
    where: { seasonId, conquestCount: { gt: 0 } },
  });
  for (const { userId } of members) {
    await prisma.$transaction(
      async (tx) => {
        if (await tx.seasonResult.findUnique({ where: { seasonId_userId: { seasonId, userId } } }))
          return;
        const stats = await tx.seasonRegionStat.findMany({
          where: { seasonId, userId, conquestCount: { gt: 0 } },
          include: { sigungu: { select: { name: true } } },
        });
        // 대표 결과: 상위 %가 가장 높은(작은) 구, 같으면 티어·정복 수
        const best = [...stats].sort(
          (a, b) =>
            (a.topPercent?.toNumber() ?? 100) - (b.topPercent?.toNumber() ?? 100) ||
            TIER_ORDER[b.tier as TierCode] - TIER_ORDER[a.tier as TierCode] ||
            b.conquestCount - a.conquestCount,
        )[0];
        if (!best || best.rankNo === null) return;
        const bestRank = Math.min(...stats.map((s) => s.rankNo ?? Infinity));
        // 1위(먹짱)는 참여자가 적어도 상위 10% 보상(황금 방망이·밤하늘)까지 모두 받는다 (2026-10-06 확정)
        const topPercent = bestRank === 1 ? 0 : (best.topPercent?.toNumber() ?? 100);
        const { club, honors } = await rewardItemsFor(tx, bestRank, topPercent);
        const rewardPoint = policy?.point ?? 0;

        const result = await tx.seasonResult.create({
          data: {
            seasonId,
            userId,
            bestSigunguId: best.sigunguId,
            bestTier: best.tier,
            bestRankNo: best.rankNo,
            bestTopPercent: best.topPercent,
            conquestTotal: stats.reduce((s, x) => s + x.conquestCount, 0),
            rewardPoint,
            rewardClubItemId: club?.id ?? null,
            regDate: now,
          },
        });
        if (club) await giveItem(tx, userId, club.id, seasonId, now);
        for (const honor of honors) await giveItem(tx, userId, honor.id, seasonId, now);
        await addPoint(
          tx,
          userId,
          rewardPoint,
          'SEASON_REWARD',
          `시즌 ${season.seasonNo} 보상`,
          {
            type: 'SEASON_RESULT',
            id: result.id,
          },
          now,
        );
        await grantSeasonRankAchievements(tx, userId, seasonId, bestRank, now);
        await notify(
          tx,
          userId,
          {
            category: 'RANK',
            type: 'SEASON_END',
            title: `시즌 ${season.seasonNo}이 끝났어요`,
            content: `${tierTitle(best.sigungu.name, best.tier as TierCode)} · ${best.rankNo}위 · 최종 결과를 확인해 보세요`,
            refType: 'SEASON',
            refId: seasonId,
          },
          now,
        );
      },
      { timeout: 15_000 },
    );
  }
  await prisma.season.update({ where: { id: seasonId }, data: { status: 'F', finalizedAt: now } });
  return { finalized: true, members: members.length };
}

/** 하루 1번: 끝난 시즌 확정, 다음 시즌 열기 */
export async function runSeasonJob(now = new Date()) {
  const today = kstTodayAsDbDate(now);
  await prisma.season.updateMany({
    where: { status: 'A', endDate: { lt: today } },
    data: { status: 'E' },
  });
  const closing = await prisma.season.findMany({
    where: { status: 'E' },
    orderBy: { seasonNo: 'asc' },
  });
  const finalized = [];
  for (const season of closing)
    finalized.push({ seasonNo: season.seasonNo, ...(await finalizeSeason(season.id, now)) });

  let opened: number | null = null;
  const active = await prisma.season.findFirst({ where: { status: 'A' } });
  if (!active) {
    const upcoming = await prisma.season.findFirst({
      where: { status: 'U', startDate: { lte: today } },
      orderBy: { startDate: 'asc' },
    });
    if (upcoming) {
      await prisma.season.update({ where: { id: upcoming.id }, data: { status: 'A' } });
      opened = upcoming.seasonNo;
    } else {
      const last = await prisma.season.findFirst({ orderBy: { seasonNo: 'desc' } });
      const startDate = last ? addDays(last.endDate, 1) : today;
      const endDate = addDays(addMonthsDb(startDate, SEASON_MONTHS), -1);
      if (!(await prisma.season.findFirst({ where: { status: 'U' } }))) {
        const created = await prisma.season.create({
          data: {
            seasonNo: (last?.seasonNo ?? 0) + 1,
            startDate,
            endDate,
            status: startDate <= today ? 'A' : 'U',
          },
        });
        opened = created.status === 'A' ? created.seasonNo : null;
      }
    }
  }
  return { finalized, opened };
}
