import type { Db, Tx } from '../../common/db';
import { Prisma } from '../../generated/prisma/client';

// 티어 (디자인 결정사항 "시즌 · 티어", ERD season_region_stat.tier):
// B 초보 탐방러(0~4곳) / R 단골(5곳~) / G 미식가(20곳~) / C 정복자(20곳~ + 상위 10%) / M 먹짱(1위)
export type TierCode = 'B' | 'R' | 'G' | 'C' | 'M';

export const TIER_ORDER: Record<TierCode, number> = { B: 0, R: 1, G: 2, C: 3, M: 4 };

export const TIER_NAME: Record<TierCode, string> = {
  B: '초보 탐방러',
  R: '단골',
  G: '미식가',
  C: '정복자',
  M: '먹짱',
};

/** API에 내려 주는 티어 이름 (코드값) */
export const TIER_API: Record<TierCode, string> = {
  B: 'BEGINNER',
  R: 'REGULAR',
  G: 'GOURMET',
  C: 'CONQUEROR',
  M: 'MUKJJANG',
};

export const REGULAR_AT = 5;
export const GOURMET_AT = 20;
/** 정복자는 미식가(20곳) 이상이면서 상위 이 % 안 */
export const CONQUEROR_TOP_PERCENT = 10;

/** "강서구 단골", "강서구의 먹짱", "강서구 초보 탐방러" */
export function tierTitle(sigunguName: string, tier: TierCode) {
  return tier === 'M' ? `${sigunguName}의 먹짱` : `${sigunguName} ${TIER_NAME[tier]}`;
}

/** 순위·상위 %·정복 수로 티어를 정한다 */
export function tierOf(count: number, rank: number | null, topPercent: number | null): TierCode {
  if (count <= 0 || rank === null) return 'B';
  if (rank === 1) return 'M';
  if (count >= GOURMET_AT && topPercent !== null && topPercent <= CONQUEROR_TOP_PERCENT) return 'C';
  if (count >= GOURMET_AT) return 'G';
  if (count >= REGULAR_AT) return 'R';
  return 'B';
}

/** 다음 티어와 거기까지 남은 정복 수 (정복자·먹짱은 순위로 정해져서 null → 순위로 셀 때는 nextTierIn) */
export function nextTierOf(tier: TierCode, count: number) {
  if (tier === 'B') return { tier: 'R' as TierCode, remaining: Math.max(REGULAR_AT - count, 1) };
  if (tier === 'R') return { tier: 'G' as TierCode, remaining: Math.max(GOURMET_AT - count, 1) };
  if (tier === 'G') return { tier: 'C' as TierCode, remaining: null };
  if (tier === 'C') return { tier: 'M' as TierCode, remaining: null };
  return null;
}

/** 정복자 자리 중 가장 낮은 순위: 상위 % (순위 ÷ 활동 탐험가 × 100, 소수 둘째 자리 반올림)가 10% 안인 마지막 순위 */
export function lastConquerorRank(active: number) {
  let rank = 0;
  while (
    rank < active &&
    Math.round(((rank + 1) / active) * 10000) / 100 <= CONQUEROR_TOP_PERCENT
  ) {
    rank += 1;
  }
  return rank;
}

/**
 * 다음 티어와 남은 정복 수. 정복자·먹짱은 순위로 정해져서 그 자리 사람보다 한 곳 더 정복해야 한다
 * (동점이면 먼저 도달한 사람이 위). 정복자 = 상위 10% 안의 마지막 순위, 먹짱 = 1위.
 * 활동 탐험가가 적어 상위 10% 안이 1위뿐이면 정복자를 건너뛰고 먹짱까지 센다
 */
export async function nextTierIn(
  db: Db,
  at: { seasonId: number; sigunguId: number },
  tier: TierCode,
  count: number,
) {
  const next = nextTierOf(tier, count);
  if (!next || next.remaining !== null) return next;
  let target: { tier: TierCode; rank: number } = { tier: 'M', rank: 1 };
  if (next.tier === 'C') {
    const active = await db.seasonRegionStat.count({ where: { ...at, conquestCount: { gt: 0 } } });
    const last = lastConquerorRank(active);
    // 1위는 먹짱이라 정복자 자리는 2위부터
    if (last >= 2) target = { tier: 'C', rank: last };
  }
  const row = await db.seasonRegionStat.findFirst({
    where: { ...at, rankNo: target.rank },
    select: { conquestCount: true },
  });
  return {
    tier: target.tier,
    remaining: Math.max((row?.conquestCount ?? count) - count + 1, 1),
  };
}

export interface RankChange {
  statId: bigint;
  userId: bigint;
  beforeTier: TierCode;
  afterTier: TierCode;
  beforeRank: number | null;
  afterRank: number | null;
}

/**
 * 한 시즌·한 구의 순위·상위 %·티어를 다시 계산한다 (정복이 생길 때마다 그 구만, 시즌 확정 때).
 * 순위: 정복 수가 많은 순, 같으면 그 수에 먼저 도달한 사람(last_conquered_at이 이른 사람)이 위.
 * 상위 % = 순위 ÷ 활동 탐험가 수(정복 1곳 이상) × 100.
 * @returns 순위나 티어가 바뀐 행 (알림·보상에 쓴다)
 */
export async function recomputeSigunguRanking(
  tx: Tx,
  seasonId: number,
  sigunguId: number,
): Promise<RankChange[]> {
  const rows = await tx.seasonRegionStat.findMany({
    where: { seasonId, sigunguId },
    orderBy: [{ conquestCount: 'desc' }, { lastConqueredAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      userId: true,
      conquestCount: true,
      rankNo: true,
      topPercent: true,
      tier: true,
    },
  });
  const active = rows.filter((r) => r.conquestCount > 0).length;
  const changes: RankChange[] = [];
  const updates: { id: bigint; rank: number | null; topPercent: number | null; tier: TierCode }[] =
    [];
  let position = 0;
  for (const row of rows) {
    let rank: number | null = null;
    let topPercent: number | null = null;
    if (row.conquestCount > 0) {
      position += 1;
      rank = position;
      topPercent = Math.round((rank / active) * 10000) / 100;
    }
    const tier = tierOf(row.conquestCount, rank, topPercent);
    const before = row.tier as TierCode;
    const samePercent =
      (row.topPercent === null && topPercent === null) ||
      (row.topPercent !== null && topPercent !== null && row.topPercent.toNumber() === topPercent);
    if (row.rankNo === rank && samePercent && before === tier) continue;
    updates.push({ id: row.id, rank, topPercent, tier });
    changes.push({
      statId: row.id,
      userId: row.userId,
      beforeTier: before,
      afterTier: tier,
      beforeRank: row.rankNo,
      afterRank: rank,
    });
  }
  // 새 탐험가가 생기면 그 구 모든 행의 상위 %가 바뀌므로 행마다 UPDATE하지 않고 한 번에 바꾼다
  if (updates.length > 0) {
    const caseOf = (pick: (u: (typeof updates)[number]) => unknown) =>
      Prisma.join(
        updates.map((u) => Prisma.sql`WHEN ${u.id} THEN ${pick(u)}`),
        ' ',
      );
    await tx.$executeRaw`
      UPDATE season_region_stat SET
        rank_no = CASE id ${caseOf((u) => u.rank)} END,
        top_percent = CASE id ${caseOf((u) => u.topPercent)} END,
        tier = CASE id ${caseOf((u) => u.tier)} END,
        update_date = NOW(3)
      WHERE id IN (${Prisma.join(updates.map((u) => u.id))})`;
  }
  return changes;
}
