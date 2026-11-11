import { findCurrentSeason } from '../../common/season';
import { addDays } from '../../common/time';
import { prisma } from '../../lib/prisma';
import { loadMukkaebi } from '../mukkaebi/mukkaebi-view';
import { listCelebrations } from '../mukkaebi/mukkaebi.service';
import { KEEP_DAYS } from '../notification/notification.service';
import { toSeasonView } from '../ranking/season-view';
import {
  nextTierIn,
  nextTierOf,
  TIER_API,
  TIER_NAME,
  TIER_ORDER,
  type TierCode,
  tierTitle,
} from '../ranking/tier';
import { loadTitles, titleOf } from '../ranking/title';

/** 대표 구: 이번 시즌 가장 높은 티어의 구, 정복이 없으면 내 첫 번째 동네 구 */
async function mainSigungu(userId: bigint, seasonId: number | null) {
  const stats = seasonId
    ? await prisma.seasonRegionStat.findMany({
        where: { userId, seasonId, conquestCount: { gt: 0 } },
        include: { sigungu: { select: { id: true, name: true } } },
      })
    : [];
  const best = [...stats].sort(
    (a, b) =>
      TIER_ORDER[b.tier as TierCode] - TIER_ORDER[a.tier as TierCode] ||
      (a.rankNo ?? Infinity) - (b.rankNo ?? Infinity),
  )[0];
  if (best)
    return {
      sigungu: best.sigungu,
      stat: best,
      total: stats.reduce((s, x) => s + x.conquestCount, 0),
    };
  const local = await prisma.memberLocalRegion.findFirst({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
    select: { sigungu: { select: { id: true, name: true } } },
  });
  return { sigungu: local?.sigungu ?? null, stat: null, total: 0 };
}

async function rankSummary(userId: bigint, seasonId: number | null) {
  const { sigungu, stat, total } = await mainSigungu(userId, seasonId);
  if (!sigungu) return { conquestCount: total, main: null };
  const leader =
    seasonId !== null
      ? await prisma.seasonRegionStat.findFirst({
          where: { seasonId, sigunguId: sigungu.id, rankNo: 1 },
        })
      : null;
  const count = stat?.conquestCount ?? 0;
  const tier = (stat?.tier ?? 'B') as TierCode;
  const next =
    seasonId !== null
      ? await nextTierIn(prisma, { seasonId, sigunguId: sigungu.id }, tier, count)
      : nextTierOf(tier, count);
  return {
    conquestCount: total,
    main: {
      sigunguId: sigungu.id,
      sigunguName: sigungu.name,
      conquestCount: count,
      rank: stat?.rankNo ?? null,
      tier: TIER_API[tier],
      tierTitle: tierTitle(sigungu.name, tier),
      nextTier: next ? { tierName: TIER_NAME[next.tier], remaining: next.remaining } : null,
      mukjjangGap:
        !leader || leader.userId === userId ? 0 : Math.max(leader.conquestCount - count + 1, 1),
    },
  };
}

/** HOME-01 홈 상단: 먹깨비·대표 칭호·시즌·대표 구 순위·안 읽은 알림·축하 이벤트 수 */
export async function getHomeSummary(userId: bigint, now = new Date()) {
  const season = await findCurrentSeason();
  const [mukkaebi, titles, rank, unread, celebrations] = await Promise.all([
    loadMukkaebi(userId),
    loadTitles([userId], season?.id ?? null),
    rankSummary(userId, season?.id ?? null),
    prisma.notification.count({
      where: { userId, isRead: false, regDate: { gte: addDays(now, -KEEP_DAYS) } },
    }),
    listCelebrations(userId),
  ]);
  const { celebratedLevel: _celebrated, ...mukkaebiView } = mukkaebi;
  return {
    mukkaebi: mukkaebiView,
    title: titleOf(titles, userId),
    season: season ? toSeasonView({ ...season, status: 'A' }, now) : null,
    rank,
    unreadNotificationCount: unread,
    celebrationCount: celebrations.items.length,
  };
}

/** USER-08 내 정보 메인 요약 */
export async function getMySummary(userId: bigint, now = new Date()) {
  const season = await findCurrentSeason();
  const [
    member,
    mukkaebi,
    titles,
    rank,
    seasonReviews,
    helpful,
    newItems,
    titleCount,
    savedCount,
    pickCount,
    home,
  ] = await Promise.all([
    prisma.member.findUniqueOrThrow({ where: { id: userId } }),
    loadMukkaebi(userId),
    loadTitles([userId], season?.id ?? null),
    rankSummary(userId, season?.id ?? null),
    season
      ? prisma.review.count({ where: { userId, status: 'A', visit: { seasonId: season.id } } })
      : 0,
    // 이번 시즌 방문으로 쓴 리뷰가 받은 도움돼요 (seasonRecord라서 시즌 기준)
    season
      ? prisma.review.aggregate({
          where: { userId, status: 'A', visit: { seasonId: season.id } },
          _sum: { helpfulCount: true },
        })
      : { _sum: { helpfulCount: 0 } },
    prisma.memberItem.count({ where: { userId, seenAt: null, quantity: { gt: 0 } } }),
    Promise.all([
      prisma.memberAchievement.count({ where: { userId } }),
      prisma.seasonRegionStat.count({ where: { userId, tier: { not: 'B' } } }),
    ]).then(([a, t]) => a + t),
    prisma.savedRestaurant.count({ where: { userId } }),
    prisma.memberPick.count({ where: { userId } }),
    prisma.memberLocalRegion.findFirst({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
      select: { region: { select: { name: true } }, sigungu: { select: { name: true } } },
    }),
  ]);
  return {
    nickname: member.nickname,
    title: titleOf(titles, userId),
    homeRegion: home ? `${home.sigungu.name} ${home.region.name}` : null,
    gender: member.gender,
    ageGroup: member.ageGroup,
    trustTemp: member.trustTemp.toNumber(),
    pointBalance: member.pointBalance,
    mukkaebi: {
      level: mukkaebi.level,
      stage: mukkaebi.stage,
      stageName: mukkaebi.stageName,
      equipped: mukkaebi.equipped,
    },
    season: season ? toSeasonView({ ...season, status: 'A' }, now) : null,
    seasonRecord: {
      conquestCount: rank.conquestCount,
      reviewCount: seasonReviews,
      helpfulReceived: helpful._sum.helpfulCount ?? 0,
      main: rank.main,
    },
    newItemCount: newItems,
    titleCount,
    savedRestaurantCount: savedCount,
    pickCount,
  };
}
