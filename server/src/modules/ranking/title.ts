import type { Db } from '../../common/db';
import { prisma } from '../../lib/prisma';
import { TIER_ORDER, type TierCode, tierTitle } from './tier';

const BEGINNER_TITLE = '초보 탐방러';

/**
 * 회원별 대표 칭호 문구 (리뷰 카드·탐방러 프로필·랭킹). RANK-09에서 고른 칭호, 고르지 않았으면 이번 시즌 가장 높은 티어 칭호.
 * - 업적 칭호: 업적 이름 (예: "도움왕")
 * - 시즌 티어 칭호: "강서구 단골", "강서구의 먹짱" (그 season_region_stat 행의 지금 티어)
 * @returns key = 회원 id 문자열
 */
export async function loadTitles(
  userIds: bigint[],
  currentSeasonId: number | null,
  db: Db = prisma,
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  if (userIds.length === 0) return titles;
  const members = await db.member.findMany({
    where: { id: { in: userIds } },
    select: { id: true, repTitleType: true, repTitleRef: true },
  });
  const achievementIds = members
    .filter((m) => m.repTitleType === 'A' && m.repTitleRef !== null)
    .map((m) => Number(m.repTitleRef));
  const statIds = members
    .filter((m) => m.repTitleType === 'T' && m.repTitleRef !== null)
    .map((m) => m.repTitleRef as bigint);

  const [achievements, chosenStats, seasonStats] = await Promise.all([
    achievementIds.length
      ? db.achievement.findMany({
          where: { id: { in: achievementIds } },
          select: { id: true, name: true },
        })
      : [],
    statIds.length
      ? db.seasonRegionStat.findMany({
          where: { id: { in: statIds } },
          select: { id: true, tier: true, sigungu: { select: { name: true } } },
        })
      : [],
    currentSeasonId === null
      ? []
      : db.seasonRegionStat.findMany({
          where: { seasonId: currentSeasonId, userId: { in: userIds }, conquestCount: { gt: 0 } },
          select: { userId: true, tier: true, rankNo: true, sigungu: { select: { name: true } } },
        }),
  ]);
  const achievementName = new Map(achievements.map((a) => [a.id, a.name]));
  const chosenStat = new Map(chosenStats.map((s) => [s.id.toString(), s]));

  // 이번 시즌 가장 높은 티어(같으면 순위가 높은 구)
  const best = new Map<string, (typeof seasonStats)[number]>();
  for (const stat of seasonStats) {
    const key = stat.userId.toString();
    const prev = best.get(key);
    const better =
      !prev ||
      TIER_ORDER[stat.tier as TierCode] > TIER_ORDER[prev.tier as TierCode] ||
      (stat.tier === prev.tier && (stat.rankNo ?? Infinity) < (prev.rankNo ?? Infinity));
    if (better) best.set(key, stat);
  }

  for (const m of members) {
    const key = m.id.toString();
    if (m.repTitleType === 'A' && m.repTitleRef !== null) {
      const name = achievementName.get(Number(m.repTitleRef));
      if (name) {
        titles.set(key, name);
        continue;
      }
    }
    if (m.repTitleType === 'T' && m.repTitleRef !== null) {
      const stat = chosenStat.get(m.repTitleRef.toString());
      if (stat) {
        titles.set(key, tierTitle(stat.sigungu.name, stat.tier as TierCode));
        continue;
      }
    }
    const top = best.get(key);
    titles.set(key, top ? tierTitle(top.sigungu.name, top.tier as TierCode) : BEGINNER_TITLE);
  }
  return titles;
}

/** loadTitles 결과에서 한 명 (없으면 초보 탐방러) */
export function titleOf(titles: Map<string, string>, userId: bigint) {
  return titles.get(userId.toString()) ?? BEGINNER_TITLE;
}
