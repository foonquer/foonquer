import { AppError } from '../../common/errors/app-error';
import { toPageResult } from '../../common/pagination';
import { findCurrentSeason } from '../../common/season';
import { toKstIso } from '../../common/time';
import { publicImageUrl } from '../../lib/image-url';
import { prisma } from '../../lib/prisma';
import { isReached, progressOf } from '../achievement/achievement.service';
import { BACKGROUND_UNLOCK_COUNT } from '../conquest/conquest.service';
import type {
  MukjjangMapQuery,
  RepresentativeTitleBody,
  SeasonQuery,
  SigunguDetailQuery,
} from './ranking.schema';
import { RankingError } from './ranking.errors';
import { findSigungu, resolveSeason, toSeasonView } from './season-view';
import { nextTierIn, TIER_API, TIER_NAME, type TierCode, tierTitle } from './tier';
import { loadTitles, titleOf } from './title';

/** 티어 이름·칭호와 다음 티어까지 남은 정복 수 (정복자·먹짱은 그 구 순위로 센다) */
const tierView = async (
  at: { seasonId: number; sigunguId: number },
  sigunguName: string,
  tier: string,
  count: number,
) => {
  const code = tier as TierCode;
  const next = await nextTierIn(prisma, at, code, count);
  return {
    tier: TIER_API[code],
    tierName: TIER_NAME[code],
    tierTitle: tierTitle(sigunguName, code),
    nextTier: next
      ? { tier: TIER_API[next.tier], tierName: TIER_NAME[next.tier], remaining: next.remaining }
      : null,
  };
};

/** 랭킹 줄의 회원 (RANK-05와 같은 값) */
const PREVIEW_USER = {
  nickname: true,
  profileImageKey: true,
  status: true,
  mukkaebi: { select: { level: true, hatItem: { select: { code: true } } } },
} as const;

/** 시즌·구별 활동 탐험가 수 (정복 1곳 이상) */
async function activeCounts(seasonId: number, sigunguIds: number[]) {
  if (sigunguIds.length === 0) return new Map<number, number>();
  const rows = await prisma.seasonRegionStat.groupBy({
    by: ['sigunguId'],
    where: { seasonId, sigunguId: { in: sigunguIds }, conquestCount: { gt: 0 } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.sigunguId, r._count._all]));
}

/** 1위 정복 수 (먹짱까지 남은 수 계산) */
async function leaderOf(seasonId: number, sigunguId: number) {
  return prisma.seasonRegionStat.findFirst({
    where: { seasonId, sigunguId, rankNo: 1 },
    include: {
      user: { select: { id: true, nickname: true, profileImageKey: true, status: true } },
    },
  });
}

/** 먹짱까지 남은 정복 수 — 1위보다 하나 더 (동점이면 먼저 도달한 사람이 위라서), 내가 1위면 0 */
function gapToMukjjang(
  myCount: number,
  leader: { userId: bigint; conquestCount: number } | null,
  userId: bigint,
) {
  if (!leader || leader.userId === userId) return 0;
  return Math.max(leader.conquestCount - myCount + 1, 1);
}

/** RANK-01 현재 시즌 */
export async function getCurrentSeason() {
  const season = await findCurrentSeason();
  if (!season) throw new AppError(RankingError.NO_ACTIVE_SEASON);
  return toSeasonView({ ...season, status: 'A' });
}

/** RANK-02 시즌 목록 (진행 중·지난 시즌, 최신순) */
export async function listSeasons() {
  const seasons = await prisma.season.findMany({
    where: { status: { not: 'U' } },
    orderBy: { seasonNo: 'desc' },
  });
  return { items: seasons.map((s) => toSeasonView(s)) };
}

/** RANK-03 내 구별 정복 현황 (내 동네 구가 맨 앞, 그다음 정복 많은 순) */
export async function getMySigunguConquests(userId: bigint, query: SeasonQuery) {
  const season = await resolveSeason(query.seasonId);
  const [stats, locals] = await Promise.all([
    prisma.seasonRegionStat.findMany({
      where: { userId, seasonId: season.id, conquestCount: { gt: 0 } },
      include: { sigungu: { select: { id: true, name: true } } },
    }),
    prisma.memberLocalRegion.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
      select: { sigungu: { select: { id: true, name: true } } },
    }),
  ]);
  const localIds = [...new Set(locals.map((l) => l.sigungu.id))];
  const bySigungu = new Map(stats.map((s) => [s.sigunguId, s]));
  const rows = [
    ...localIds.map((id) => ({
      sigungu: locals.find((l) => l.sigungu.id === id)?.sigungu ?? { id, name: '' },
      stat: bySigungu.get(id) ?? null,
      isLocal: true,
    })),
    ...stats
      .filter((s) => !localIds.includes(s.sigunguId))
      .sort((a, b) => b.conquestCount - a.conquestCount)
      .map((s) => ({ sigungu: s.sigungu, stat: s, isLocal: false })),
  ];
  const actives = await activeCounts(
    season.id,
    rows.map((r) => r.sigungu.id),
  );
  return {
    season: toSeasonView(season),
    totalConquestCount: stats.reduce((sum, s) => sum + s.conquestCount, 0),
    sigunguCount: stats.length,
    items: await Promise.all(
      rows.map(async ({ sigungu, stat, isLocal }) => ({
        sigunguId: sigungu.id,
        sigunguName: sigungu.name,
        isLocal,
        conquestCount: stat?.conquestCount ?? 0,
        rank: stat?.rankNo ?? null,
        topPercent: stat?.topPercent?.toNumber() ?? null,
        activeExplorerCount: actives.get(sigungu.id) ?? 0,
        ...(await tierView(
          { seasonId: season.id, sigunguId: sigungu.id },
          sigungu.name,
          stat?.tier ?? 'B',
          stat?.conquestCount ?? 0,
        )),
      })),
    ),
  };
}

/** RANK-04 구 상세 현황 */
export async function getMySigunguDetail(
  userId: bigint,
  sigunguId: number,
  query: SigunguDetailQuery,
) {
  const [season, sigungu] = await Promise.all([
    resolveSeason(query.seasonId),
    findSigungu(sigunguId),
  ]);
  const [mine, leader, actives, conquests, conquestTotal] = await Promise.all([
    prisma.seasonRegionStat.findUnique({
      where: { seasonId_sigunguId_userId: { seasonId: season.id, sigunguId, userId } },
    }),
    leaderOf(season.id, sigunguId),
    activeCounts(season.id, [sigunguId]),
    prisma.conquest.findMany({
      where: { userId, seasonId: season.id, sigunguId },
      orderBy: { conqueredAt: 'desc' },
      skip: (query.page - 1) * query.size,
      take: query.size,
      include: {
        restaurant: { select: { id: true, name: true, category: { select: { name: true } } } },
      },
    }),
    prisma.conquest.count({ where: { userId, seasonId: season.id, sigunguId } }),
  ]);
  const count = mine?.conquestCount ?? 0;
  const myRank = mine?.rankNo ?? null;
  // 랭킹 미리보기: 1위와 내 앞뒤
  const around = myRank
    ? await prisma.seasonRegionStat.findMany({
        where: {
          seasonId: season.id,
          sigunguId,
          rankNo: { gte: Math.max(1, myRank - 1), lte: myRank + 1 },
        },
        orderBy: { rankNo: 'asc' },
        include: { user: { select: PREVIEW_USER } },
      })
    : [];
  const first =
    leader && !around.some((s) => s.rankNo === 1)
      ? await prisma.seasonRegionStat.findUnique({
          where: { id: leader.id },
          include: { user: { select: PREVIEW_USER } },
        })
      : null;
  // RANK-05 줄과 같은 모양 (먹깨비 모자·티어 이름까지)
  const preview = [...(first ? [first] : []), ...around].map((s) => ({
    rank: s.rankNo,
    userId: s.user.status === 'D' ? null : s.userId,
    nickname: s.user.status === 'D' ? '탈퇴한 탐험가' : s.user.nickname,
    profileImageUrl: publicImageUrl(s.user.profileImageKey),
    mukkaebi: {
      level: s.user.mukkaebi?.level ?? 1,
      hatCode: s.user.mukkaebi?.hatItem?.code ?? null,
    },
    conquestCount: s.conquestCount,
    tier: TIER_API[s.tier as TierCode],
    tierName: TIER_NAME[s.tier as TierCode],
    isMe: s.userId === userId,
  }));
  const tier = await tierView(
    { seasonId: season.id, sigunguId },
    sigungu.name,
    mine?.tier ?? 'B',
    count,
  );
  return {
    season: toSeasonView(season),
    sigunguId: sigungu.id,
    sigunguName: sigungu.name,
    conquestCount: count,
    rank: myRank,
    topPercent: mine?.topPercent?.toNumber() ?? null,
    activeExplorerCount: actives.get(sigunguId) ?? 0,
    ...tier,
    tierProgress: {
      current: count,
      nextTierAt: tier.nextTier?.remaining ? count + tier.nextTier.remaining : null,
      nextTierName: tier.nextTier?.tierName ?? null,
    },
    mukjjangGap: gapToMukjjang(count, leader, userId),
    rankingPreview: preview,
    restaurants: toPageResult(
      conquests.map((c) => ({
        restaurantId: c.restaurant.id,
        name: c.restaurant.name,
        categoryName: c.restaurant.category?.name ?? null,
        conqueredAt: toKstIso(c.conqueredAt),
      })),
      { ...query, totalCount: conquestTotal },
    ),
  };
}

/** RANK-05 구 랭킹 TOP 50 + 내 순위 + TOP 3의 PICK */
export async function getSigunguRanking(userId: bigint, sigunguId: number, query: SeasonQuery) {
  const [season, sigungu] = await Promise.all([
    resolveSeason(query.seasonId),
    findSigungu(sigunguId),
  ]);
  const [top, mine, actives] = await Promise.all([
    prisma.seasonRegionStat.findMany({
      where: { seasonId: season.id, sigunguId, rankNo: { not: null, lte: 50 } },
      orderBy: { rankNo: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            profileImageKey: true,
            status: true,
            mukkaebi: { select: { level: true, hatItem: { select: { code: true } } } },
          },
        },
      },
    }),
    prisma.seasonRegionStat.findUnique({
      where: { seasonId_sigunguId_userId: { seasonId: season.id, sigunguId, userId } },
    }),
    activeCounts(season.id, [sigunguId]),
  ]);
  const leader = top.find((s) => s.rankNo === 1) ?? null;
  const top3 = top.slice(0, 3);
  const picks = await prisma.memberPick.findMany({
    where: { userId: { in: top3.map((s) => s.userId) } },
    orderBy: { sortOrder: 'asc' },
    select: { userId: true, restaurant: { select: { id: true, name: true } } },
  });
  return {
    season: toSeasonView(season),
    sigunguId: sigungu.id,
    sigunguName: sigungu.name,
    activeExplorerCount: actives.get(sigunguId) ?? 0,
    items: top.map((s) => ({
      rank: s.rankNo,
      userId: s.user.status === 'D' ? null : s.userId,
      nickname: s.user.status === 'D' ? '탈퇴한 탐험가' : s.user.nickname,
      profileImageUrl: publicImageUrl(s.user.profileImageKey),
      mukkaebi: {
        level: s.user.mukkaebi?.level ?? 1,
        hatCode: s.user.mukkaebi?.hatItem?.code ?? null,
      },
      conquestCount: s.conquestCount,
      tier: TIER_API[s.tier as TierCode],
      tierName: TIER_NAME[s.tier as TierCode],
      isMe: s.userId === userId,
    })),
    myRank: mine?.rankNo
      ? {
          rank: mine.rankNo,
          conquestCount: mine.conquestCount,
          topPercent: mine.topPercent?.toNumber() ?? null,
          tier: TIER_API[mine.tier as TierCode],
          mukjjangGap: gapToMukjjang(mine.conquestCount, leader, userId),
        }
      : null,
    topPicks: top3.map((s) => {
      const list = picks.filter((p) => p.userId === s.userId);
      const withdrawn = s.user.status === 'D';
      return {
        rank: s.rankNo,
        userId: withdrawn ? null : s.userId,
        nickname: withdrawn ? '탈퇴한 탐험가' : s.user.nickname,
        pickCount: list.length,
        restaurants: list
          .slice(0, 2)
          .map((p) => ({ restaurantId: p.restaurant.id, name: p.restaurant.name })),
      };
    }),
  };
}

/** RANK-06 먹짱 지도 — 구별 먹짱, sigunguId를 주면 그 구의 동별 1위 */
export async function getMukjjangMap(userId: bigint, query: MukjjangMapQuery) {
  const season = await resolveSeason(query.seasonId);
  if (query.sigunguId) {
    const sigungu = await findSigungu(query.sigunguId);
    const rows = await prisma.$queryRaw<
      { region_id: number; user_id: bigint; n: bigint; last_at: Date }[]
    >`
      SELECT r.region_id, c.user_id, COUNT(*) AS n, MAX(c.conquered_at) AS last_at
      FROM conquest c JOIN restaurant r ON r.id = c.restaurant_id
      WHERE c.season_id = ${season.id} AND c.sigungu_id = ${sigungu.id}
      GROUP BY r.region_id, c.user_id`;
    const best = new Map<number, (typeof rows)[number]>();
    for (const row of rows) {
      const prev = best.get(row.region_id);
      if (!prev || row.n > prev.n || (row.n === prev.n && row.last_at < prev.last_at))
        best.set(row.region_id, row);
    }
    const [dongs, users] = await Promise.all([
      prisma.region.findMany({
        where: { parentId: sigungu.id, level: 3 },
        orderBy: { code: 'asc' },
        select: { id: true, name: true, centerLat: true, centerLng: true },
      }),
      prisma.member.findMany({
        where: { id: { in: [...best.values()].map((b) => b.user_id) } },
        select: { id: true, nickname: true, profileImageKey: true },
      }),
    ]);
    const userOf = new Map(users.map((u) => [u.id.toString(), u]));
    return {
      season: toSeasonView(season),
      level: 'DONG',
      sigunguId: sigungu.id,
      sigunguName: sigungu.name,
      items: dongs.map((d) => {
        const b = best.get(d.id);
        const u = b ? userOf.get(b.user_id.toString()) : undefined;
        return {
          regionId: d.id,
          name: d.name,
          centerLat: d.centerLat?.toNumber() ?? null,
          centerLng: d.centerLng?.toNumber() ?? null,
          leader:
            b && u
              ? {
                  userId: u.id,
                  nickname: u.nickname,
                  profileImageUrl: publicImageUrl(u.profileImageKey),
                  conquestCount: Number(b.n),
                  isMe: u.id === userId,
                }
              : null,
        };
      }),
    };
  }

  const [sigungus, leaders, mine] = await Promise.all([
    prisma.region.findMany({
      where: { level: 2 },
      orderBy: { code: 'asc' },
      select: { id: true, name: true, centerLat: true, centerLng: true },
    }),
    prisma.seasonRegionStat.findMany({
      where: { seasonId: season.id, rankNo: 1 },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            profileImageKey: true,
            mukkaebi: { select: { level: true } },
          },
        },
      },
    }),
    prisma.seasonRegionStat.findMany({ where: { seasonId: season.id, userId } }),
  ]);
  const leaderOfSigungu = new Map(leaders.map((l) => [l.sigunguId, l]));
  const mineOf = new Map(mine.map((m) => [m.sigunguId, m]));
  return {
    season: toSeasonView(season),
    level: 'SIGUNGU',
    items: sigungus.map((g) => {
      const l = leaderOfSigungu.get(g.id) ?? null;
      const m = mineOf.get(g.id);
      return {
        sigunguId: g.id,
        name: g.name,
        centerLat: g.centerLat?.toNumber() ?? null,
        centerLng: g.centerLng?.toNumber() ?? null,
        mukjjang: l
          ? {
              userId: l.user.id,
              nickname: l.user.nickname,
              profileImageUrl: publicImageUrl(l.user.profileImageKey),
              level: l.user.mukkaebi?.level ?? 1,
              conquestCount: l.conquestCount,
              isMe: l.userId === userId,
            }
          : null,
        myRank: m?.rankNo ?? null,
        myConquestCount: m?.conquestCount ?? 0,
        mukjjangGap: gapToMukjjang(m?.conquestCount ?? 0, l, userId),
      };
    }),
  };
}

/** RANK-07 구별 배경 해금 현황 (모든 시즌 누적, 서로 다른 가게 10곳) */
export async function getRegionBackgrounds(userId: bigint) {
  const [sigungus, counts, unlocked, mukkaebi] = await Promise.all([
    prisma.region.findMany({
      where: { level: 2 },
      orderBy: { code: 'asc' },
      select: { id: true, name: true, bgKey: true },
    }),
    prisma.$queryRaw<{ sigungu_id: number; n: bigint }[]>`
      SELECT sigungu_id, COUNT(DISTINCT restaurant_id) AS n FROM conquest WHERE user_id = ${userId} GROUP BY sigungu_id`,
    prisma.memberRegionBackground.findMany({ where: { userId } }),
    prisma.mukkaebi.findUnique({ where: { userId }, select: { bgSigunguId: true } }),
  ]);
  const countOf = new Map(counts.map((c) => [c.sigungu_id, Number(c.n)]));
  const unlockedOf = new Map(unlocked.map((u) => [u.sigunguId, u]));
  const items = sigungus.map((g) => ({
    sigunguId: g.id,
    sigunguName: g.name,
    bgKey: g.bgKey,
    conquestCount: Math.min(countOf.get(g.id) ?? 0, BACKGROUND_UNLOCK_COUNT),
    requiredCount: BACKGROUND_UNLOCK_COUNT,
    unlocked: unlockedOf.has(g.id),
    unlockedAt: unlockedOf.get(g.id) ? toKstIso(unlockedOf.get(g.id)!.unlockedAt) : null,
    isSelected: mukkaebi?.bgSigunguId === g.id,
  }));
  return { unlockedCount: unlocked.length, totalCount: sigungus.length, items };
}

/** RANK-08 업적 목록과 진행도 */
export async function getAchievements(userId: bigint) {
  const season = await findCurrentSeason();
  const [all, mine, titles] = await Promise.all([
    prisma.achievement.findMany({ where: { status: 'A' }, orderBy: { sortOrder: 'asc' } }),
    prisma.memberAchievement.findMany({ where: { userId } }),
    loadTitles([userId], season?.id ?? null),
  ]);
  const mineOf = new Map(mine.map((m) => [m.achievementId, m]));
  const progress = new Map<string, number>();
  for (const a of all) {
    if (!progress.has(a.conditionType))
      progress.set(a.conditionType, await progressOf(prisma, userId, a.conditionType));
  }
  return {
    achievedCount: mine.length,
    totalCount: all.length,
    representativeTitle: titleOf(titles, userId),
    items: all.map((a) => {
      const done = mineOf.get(a.id);
      const current = progress.get(a.conditionType) ?? 0;
      return {
        achievementId: a.id,
        code: a.code,
        name: a.name,
        description: a.description,
        iconKey: a.iconKey,
        rewardPoint: a.rewardPoint,
        achieved: Boolean(done),
        achievedAt: done ? toKstIso(done.achievedAt) : null,
        progress:
          a.conditionType === 'SEASON_RANK'
            ? {
                current: done || isReached(a.conditionType, current, a.conditionValue) ? 1 : 0,
                target: 1,
              }
            : { current: Math.min(current, a.conditionValue), target: a.conditionValue },
      };
    }),
  };
}

/** RANK-11 보유 칭호 (업적 칭호 + 단골 이상 시즌 티어 칭호) */
export async function getTitles(userId: bigint) {
  const season = await findCurrentSeason();
  const [member, achievements, stats, titles] = await Promise.all([
    prisma.member.findUniqueOrThrow({
      where: { id: userId },
      select: { repTitleType: true, repTitleRef: true },
    }),
    prisma.memberAchievement.findMany({
      where: { userId },
      orderBy: { achievedAt: 'desc' },
      include: { achievement: { select: { id: true, name: true } } },
    }),
    prisma.seasonRegionStat.findMany({
      where: {
        userId,
        tier: { not: 'B' },
        OR: [{ isFinalized: true }, ...(season ? [{ seasonId: season.id }] : [])],
      },
      orderBy: [{ season: { seasonNo: 'desc' } }, { conquestCount: 'desc' }],
      include: { season: { select: { seasonNo: true } }, sigungu: { select: { name: true } } },
    }),
    loadTitles([userId], season?.id ?? null),
  ]);
  const items = [
    ...stats.map((s) => ({
      type: 'TIER' as const,
      refId: s.id,
      title: tierTitle(s.sigungu.name, s.tier as TierCode),
      seasonNo: s.season.seasonNo,
      isCurrent: s.seasonId === season?.id,
      isRepresentative: member.repTitleType === 'T' && member.repTitleRef === s.id,
    })),
    ...achievements.map((a) => ({
      type: 'ACHIEVEMENT' as const,
      refId: BigInt(a.achievement.id),
      title: a.achievement.name,
      seasonNo: null,
      isCurrent: false,
      isRepresentative:
        member.repTitleType === 'A' && Number(member.repTitleRef) === a.achievement.id,
    })),
  ];
  return {
    representativeTitle: titleOf(titles, userId),
    isAuto: member.repTitleType === null,
    totalCount: items.length,
    items,
  };
}

/** RANK-09 대표 칭호 변경 (null이면 자동 — 이번 시즌 가장 높은 티어) */
export async function setRepresentativeTitle(userId: bigint, body: RepresentativeTitleBody) {
  let repTitleType: string | null = null;
  let repTitleRef: bigint | null = null;
  if (body.type === 'ACHIEVEMENT') {
    const owned = await prisma.memberAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId: Number(body.refId) } },
    });
    if (!owned) throw new AppError(RankingError.TITLE_NOT_OWNED);
    repTitleType = 'A';
    repTitleRef = BigInt(owned.achievementId);
  } else if (body.type === 'TIER') {
    const stat = await prisma.seasonRegionStat.findUnique({
      where: { id: BigInt(body.refId ?? 0) },
    });
    if (!stat || stat.userId !== userId || stat.tier === 'B')
      throw new AppError(RankingError.TITLE_NOT_OWNED);
    repTitleType = 'T';
    repTitleRef = stat.id;
  }
  await prisma.member.update({ where: { id: userId }, data: { repTitleType, repTitleRef } });
  const season = await findCurrentSeason();
  const titles = await loadTitles([userId], season?.id ?? null);
  return { representativeTitle: titleOf(titles, userId), isAuto: repTitleType === null };
}

/** RANK-10 시즌 기록 (확정된 지난 시즌 + 진행 중 시즌 요약) */
export async function getSeasonRecords(userId: bigint) {
  const season = await findCurrentSeason();
  const [results, current] = await Promise.all([
    prisma.seasonResult.findMany({
      where: { userId },
      orderBy: { season: { seasonNo: 'desc' } },
      include: {
        season: true,
        bestSigungu: { select: { id: true, name: true } },
        rewardClubItem: { select: { id: true, code: true, name: true } },
      },
    }),
    season
      ? prisma.seasonRegionStat.findMany({
          where: { userId, seasonId: season.id, conquestCount: { gt: 0 } },
          orderBy: [{ rankNo: 'asc' }],
          include: { sigungu: { select: { id: true, name: true } } },
        })
      : [],
  ]);
  const best = current[0];
  return {
    current: season
      ? {
          season: toSeasonView({ ...season, status: 'A' }),
          conquestCount: current.reduce((s, c) => s + c.conquestCount, 0),
          sigunguCount: current.length,
          best: best
            ? {
                sigunguId: best.sigungu.id,
                sigunguName: best.sigungu.name,
                rank: best.rankNo,
                ...(await tierView(
                  { seasonId: season.id, sigunguId: best.sigungu.id },
                  best.sigungu.name,
                  best.tier,
                  best.conquestCount,
                )),
              }
            : null,
        }
      : null,
    records: results.map((r) => ({
      season: toSeasonView(r.season),
      bestSigunguId: r.bestSigungu.id,
      bestSigunguName: r.bestSigungu.name,
      tier: TIER_API[r.bestTier as TierCode],
      tierTitle: tierTitle(r.bestSigungu.name, r.bestTier as TierCode),
      rank: r.bestRankNo,
      topPercent: r.bestTopPercent?.toNumber() ?? null,
      conquestTotal: r.conquestTotal,
      rewardPoint: r.rewardPoint,
      rewardClubItem: r.rewardClubItem
        ? { itemId: r.rewardClubItem.id, code: r.rewardClubItem.code, name: r.rewardClubItem.name }
        : null,
    })),
  };
}
