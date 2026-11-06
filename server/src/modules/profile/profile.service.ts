import { lockMember } from '../../common/db';
import { AppError } from '../../common/errors/app-error';
import { toPageResult } from '../../common/pagination';
import { findCurrentSeason } from '../../common/season';
import { toKstIso } from '../../common/time';
import { Prisma } from '../../generated/prisma/client';
import { publicImageUrl } from '../../lib/image-url';
import { prisma } from '../../lib/prisma';
import { loadMukkaebi } from '../mukkaebi/mukkaebi-view';
import { loadTitles, titleOf } from '../ranking/title';
import { TIER_API, TIER_ORDER, type TierCode, tierTitle } from '../ranking/tier';
import { UserError } from '../user/user.errors';
import {
  MAX_PICKS,
  type PickCandidateQuery,
  type PicksBody,
  type VisitedQuery,
} from './profile.schema';
import { ProfileError } from './profile.errors';

async function findActiveMember(userId: number | bigint) {
  const member = await prisma.member.findUnique({ where: { id: BigInt(userId) } });
  if (!member || member.status !== 'A') throw new AppError(UserError.MEMBER_NOT_FOUND);
  return member;
}

/** 회원이 가게마다 방문 인증(성공)한 횟수 */
async function visitCounts(userId: bigint, restaurantIds: bigint[]) {
  if (restaurantIds.length === 0) return new Map<string, number>();
  const rows = await prisma.visit.groupBy({
    by: ['restaurantId'],
    where: { userId, restaurantId: { in: restaurantIds }, status: { in: ['V', 'C'] } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [String(r.restaurantId), r._count._all]));
}

const pickInclude = {
  restaurant: {
    select: {
      id: true,
      name: true,
      lat: true,
      lng: true,
      category: { select: { name: true } },
      sigungu: { select: { name: true } },
      region: { select: { name: true } },
    },
  },
} satisfies Prisma.MemberPickInclude;

async function loadPicks(userId: bigint) {
  const picks = await prisma.memberPick.findMany({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
    include: pickInclude,
  });
  const counts = await visitCounts(
    userId,
    picks.map((p) => p.restaurantId),
  );
  return picks.map((p, i) => ({
    order: i + 1,
    restaurantId: p.restaurant.id,
    name: p.restaurant.name,
    categoryName: p.restaurant.category?.name ?? null,
    sigunguName: p.restaurant.sigungu.name,
    dongName: p.restaurant.region.name,
    lat: p.restaurant.lat.toNumber(),
    lng: p.restaurant.lng.toNumber(),
    comment: p.comment,
    visitCount: counts.get(p.restaurantId.toString()) ?? 0,
  }));
}

/** 모든 시즌에 정복한 서로 다른 가게 수 */
async function distinctRestaurantCount(userId: bigint) {
  const [row] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT restaurant_id) AS n FROM conquest WHERE user_id = ${userId}`;
  return Number(row?.n ?? 0);
}

/** PROFILE-01 탐방러 프로필 */
export async function getMemberProfile(viewerId: bigint, userId: number) {
  const member = await findActiveMember(userId);
  const season = await findCurrentSeason();
  const [
    titles,
    mukkaebi,
    home,
    seasonStats,
    visitedCount,
    helpful,
    reviewCount,
    results,
    achievedCount,
    recentAchievements,
    totalAchievements,
    picks,
    block,
  ] = await Promise.all([
    loadTitles([member.id], season?.id ?? null),
    loadMukkaebi(member.id),
    prisma.memberLocalRegion.findFirst({
      where: { userId: member.id },
      orderBy: { sortOrder: 'asc' },
      select: { region: { select: { name: true } }, sigungu: { select: { name: true } } },
    }),
    season
      ? prisma.seasonRegionStat.findMany({
          where: { userId: member.id, seasonId: season.id, conquestCount: { gt: 0 } },
          include: { sigungu: { select: { name: true } } },
        })
      : [],
    distinctRestaurantCount(member.id),
    prisma.review.aggregate({
      where: { userId: member.id, status: 'A' },
      _sum: { helpfulCount: true },
    }),
    prisma.review.count({ where: { userId: member.id, status: 'A' } }),
    prisma.seasonResult.findMany({
      where: { userId: member.id },
      orderBy: { season: { seasonNo: 'desc' } },
      take: 5,
      include: { season: { select: { seasonNo: true } }, bestSigungu: { select: { name: true } } },
    }),
    prisma.memberAchievement.count({ where: { userId: member.id } }),
    prisma.memberAchievement.findMany({
      where: { userId: member.id },
      orderBy: { achievedAt: 'desc' },
      take: 3,
      include: {
        achievement: { select: { id: true, name: true, description: true, iconKey: true } },
      },
    }),
    prisma.achievement.count({ where: { status: 'A' } }),
    loadPicks(member.id),
    prisma.memberBlock.findUnique({
      where: { blockerId_blockedId: { blockerId: viewerId, blockedId: member.id } },
      select: { regDate: true },
    }),
  ]);

  const best = [...seasonStats].sort(
    (a, b) =>
      TIER_ORDER[b.tier as TierCode] - TIER_ORDER[a.tier as TierCode] ||
      (a.rankNo ?? Infinity) - (b.rankNo ?? Infinity),
  )[0];
  const seasonTitles = [
    ...(season && best
      ? [
          {
            seasonNo: season.seasonNo,
            title: tierTitle(best.sigungu.name, best.tier as TierCode),
            isCurrent: true,
          },
        ]
      : []),
    ...results.map((r) => ({
      seasonNo: r.season.seasonNo,
      title: tierTitle(r.bestSigungu.name, r.bestTier as TierCode),
      isCurrent: false,
    })),
  ];

  return {
    userId: member.id,
    nickname: member.nickname,
    profileImageUrl: publicImageUrl(member.profileImageKey),
    bio: member.bio,
    trustTemp: member.trustTemp.toNumber(),
    title: titleOf(titles, member.id),
    homeRegion: home ? `${home.sigungu.name} ${home.region.name}` : null,
    mukkaebi: {
      level: mukkaebi.level,
      exp: mukkaebi.exp,
      levelExp: mukkaebi.levelExp,
      nextLevelExp: mukkaebi.nextLevelExp,
      stage: mukkaebi.stage,
      stageName: mukkaebi.stageName,
      equipped: mukkaebi.equipped,
      background: mukkaebi.background,
    },
    currentSeason: season
      ? {
          seasonId: season.id,
          seasonNo: season.seasonNo,
          conquestCount: seasonStats.reduce((sum, s) => sum + s.conquestCount, 0),
          best: best
            ? {
                sigunguId: best.sigunguId,
                sigunguName: best.sigungu.name,
                rank: best.rankNo,
                tier: TIER_API[best.tier as TierCode],
                tierTitle: tierTitle(best.sigungu.name, best.tier as TierCode),
              }
            : null,
        }
      : null,
    totalConquestCount: visitedCount,
    helpfulReceived: helpful._sum.helpfulCount ?? 0,
    seasonTitles,
    achievements: {
      achievedCount,
      totalCount: totalAchievements,
      recent: recentAchievements.map((a) => ({
        achievementId: a.achievement.id,
        name: a.achievement.name,
        description: a.achievement.description,
        iconKey: a.achievement.iconKey,
        achievedAt: toKstIso(a.achievedAt),
      })),
    },
    counts: { visitedRestaurants: visitedCount, reviews: reviewCount, picks: picks.length },
    picks,
    isMe: member.id === viewerId,
    isBlocked: block !== null,
  };
}

/** PROFILE-02 다녀온 가게 (정복 기록, 시즌·구로 거르기) */
export async function listVisitedRestaurants(
  viewerId: bigint,
  userId: number,
  query: VisitedQuery,
) {
  const member = await findActiveMember(userId);
  const season = query.seasonId ? { id: query.seasonId } : await findCurrentSeason();
  const where: Prisma.ConquestWhereInput = {
    userId: member.id,
    seasonId: season?.id ?? -1,
    sigunguId: query.sigunguId,
  };
  const [rows, totalCount, bySigungu] = await Promise.all([
    prisma.conquest.findMany({
      where,
      orderBy: [{ conqueredAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.size,
      take: query.size,
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            category: { select: { name: true } },
            sigungu: { select: { name: true } },
            region: { select: { name: true } },
          },
        },
        visit: { select: { review: { select: { id: true, overallScore: true, status: true } } } },
      },
    }),
    prisma.conquest.count({ where }),
    // 구 고르기 칸: 그 시즌에 정복한 구와 구마다 정복 수 (구를 골라도 전체 목록을 준다)
    prisma.conquest.groupBy({
      by: ['sigunguId'],
      where: { userId: member.id, seasonId: season?.id ?? -1 },
      _count: { _all: true },
    }),
  ]);
  const names = await prisma.region.findMany({
    where: { id: { in: bySigungu.map((g) => g.sigunguId) } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(names.map((r) => [r.id, r.name]));
  const sigungus = bySigungu
    .map((g) => ({
      sigunguId: g.sigunguId,
      sigunguName: nameOf.get(g.sigunguId) ?? '',
      conquestCount: g._count._all,
    }))
    .sort((a, b) => b.conquestCount - a.conquestCount || a.sigunguId - b.sigunguId);
  const items = rows.map((c) => {
    const review = c.visit.review?.status === 'A' ? c.visit.review : null;
    return {
      restaurantId: c.restaurant.id,
      name: c.restaurant.name,
      categoryName: c.restaurant.category?.name ?? null,
      sigunguName: c.restaurant.sigungu.name,
      dongName: c.restaurant.region.name,
      overallScore: review ? review.overallScore.toNumber() : null,
      reviewId: review?.id ?? null,
      conqueredAt: toKstIso(c.conqueredAt),
    };
  });
  return {
    seasonId: season?.id ?? null,
    sigunguId: query.sigunguId ?? null,
    sigungus,
    isMe: member.id === viewerId,
    ...toPageResult(items, { ...query, totalCount }),
  };
}

/** PICK-01 내 PICK과 고를 수 있는 정복한 가게 (가게마다 마지막 정복 최근순, DB에서 페이지) */
export async function getMyPicks(userId: bigint, query: PickCandidateQuery) {
  const keyword = query.keyword ? `%${query.keyword}%` : null;
  const nameFilter = keyword ? Prisma.sql`AND r.name LIKE ${keyword}` : Prisma.empty;
  const [picks, rows, [total]] = await Promise.all([
    loadPicks(userId),
    prisma.$queryRaw<{ restaurant_id: bigint }[]>`
      SELECT c.restaurant_id FROM conquest c JOIN restaurant r ON r.id = c.restaurant_id
      WHERE c.user_id = ${userId} ${nameFilter}
      GROUP BY c.restaurant_id
      ORDER BY MAX(c.conquered_at) DESC, c.restaurant_id DESC
      LIMIT ${query.size} OFFSET ${(query.page - 1) * query.size}`,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT c.restaurant_id) AS n FROM conquest c JOIN restaurant r ON r.id = c.restaurant_id
      WHERE c.user_id = ${userId} ${nameFilter}`,
  ]);
  const ids = rows.map((r) => r.restaurant_id);
  const [restaurants, counts] = await Promise.all([
    prisma.restaurant.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        category: { select: { name: true } },
        region: { select: { name: true } },
      },
    }),
    visitCounts(userId, ids),
  ]);
  const byId = new Map(restaurants.map((r) => [r.id.toString(), r]));
  const picked = new Set(picks.map((p) => p.restaurantId.toString()));
  const candidates = ids.flatMap((id) => {
    const r = byId.get(id.toString());
    if (!r) return [];
    return [
      {
        restaurantId: r.id,
        name: r.name,
        categoryName: r.category?.name ?? null,
        dongName: r.region.name,
        visitCount: counts.get(r.id.toString()) ?? 0,
        isPicked: picked.has(r.id.toString()),
      },
    ];
  });
  return {
    picks,
    maxPicks: MAX_PICKS,
    candidates: toPageResult(candidates, { ...query, totalCount: Number(total?.n ?? 0) }),
  };
}

/** PICK-02 내 PICK 저장 (순서대로 통째로 바꾼다, 정복한 가게만) */
export async function saveMyPicks(userId: bigint, body: PicksBody, now = new Date()) {
  const ids = body.picks.map((p) => BigInt(p.restaurantId));
  if (ids.length > 0) {
    const conquered = await prisma.conquest.findMany({
      where: { userId, restaurantId: { in: ids } },
      distinct: ['restaurantId'],
      select: { restaurantId: true },
    });
    if (conquered.length !== ids.length) throw new AppError(ProfileError.PICK_NOT_CONQUERED);
  }
  await prisma.$transaction(async (tx) => {
    // 같은 회원의 저장이 겹쳐 (user_id, sort_order) 충돌로 500이 나지 않게
    await lockMember(tx, userId);
    await tx.memberPick.deleteMany({ where: { userId } });
    if (ids.length > 0) {
      await tx.memberPick.createMany({
        data: body.picks.map((p, sortOrder) => ({
          userId,
          restaurantId: BigInt(p.restaurantId),
          sortOrder,
          comment: p.comment || null,
          regDate: now,
        })),
      });
    }
  });
  return { picks: await loadPicks(userId) };
}
