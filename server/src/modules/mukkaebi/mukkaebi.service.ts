import { AppError } from '../../common/errors/app-error';
import { findCurrentSeason } from '../../common/season';
import { toKstIso } from '../../common/time';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { notify } from '../notification/notify';
import { TIER_API, TIER_ORDER, type TierCode, tierTitle } from '../ranking/tier';
import { loadMukkaebi, STAGE_API, STAGE_NAME } from './mukkaebi-view';
import type { AppearanceBody, ItemCategoryQuery } from './mukkaebi.schema';
import { MukkaebiError } from './mukkaebi.errors';

const SLOT_CATEGORY = {
  hatItemId: 'HAT',
  faceItemId: 'FACE',
  propItemId: 'PROP',
  skinItemId: 'SKIN',
  clubItemId: 'CLUB',
} as const;

/** CHAR-01 내 먹깨비 */
export async function getMyMukkaebi(userId: bigint) {
  const [view, member, newItems] = await Promise.all([
    loadMukkaebi(userId),
    prisma.member.findUniqueOrThrow({ where: { id: userId }, select: { pointBalance: true } }),
    prisma.memberItem.count({ where: { userId, seenAt: null, quantity: { gt: 0 } } }),
  ]);
  const { celebratedLevel: _celebrated, ...rest } = view;
  return { ...rest, pointBalance: member.pointBalance, newItemCount: newItems };
}

/** CHAR-02 보유 아이템 (탭별). 조회하면 그 탭의 "새로 얻음" 표시는 꺼진다 */
export async function getMyItems(userId: bigint, query: ItemCategoryQuery, now = new Date()) {
  const mukkaebi = await prisma.mukkaebi.findUnique({ where: { userId } });
  const equipped = new Set(
    [
      mukkaebi?.hatItemId,
      mukkaebi?.faceItemId,
      mukkaebi?.propItemId,
      mukkaebi?.skinItemId,
      mukkaebi?.clubItemId,
    ].filter((id): id is number => typeof id === 'number'),
  );
  const items =
    query.category === 'BACKGROUND'
      ? []
      : await prisma.memberItem.findMany({
          where: {
            userId,
            quantity: { gt: 0 },
            item: query.category ? { category: query.category } : undefined,
          },
          orderBy: [{ item: { category: 'asc' } }, { item: { sortOrder: 'asc' } }],
          include: { item: true },
        });
  const backgrounds =
    !query.category || query.category === 'BACKGROUND'
      ? await prisma.memberRegionBackground.findMany({
          where: { userId },
          orderBy: { unlockedAt: 'asc' },
          include: { sigungu: { select: { id: true, name: true, bgKey: true } } },
        })
      : [];
  if (items.some((i) => i.seenAt === null)) {
    await prisma.memberItem.updateMany({
      where: { id: { in: items.filter((i) => i.seenAt === null).map((i) => i.id) } },
      data: { seenAt: now },
    });
  }
  return {
    items: items.map((m) => ({
      itemId: m.item.id,
      code: m.item.code,
      name: m.item.name,
      category: m.item.category,
      quantity: m.quantity,
      isNew: m.seenAt === null,
      isEquipped: equipped.has(m.item.id),
      acquiredAt: toKstIso(m.acquiredAt),
    })),
    backgrounds: backgrounds.map((b) => ({
      sigunguId: b.sigungu.id,
      sigunguName: b.sigungu.name,
      bgKey: b.sigungu.bgKey,
      isSelected: mukkaebi?.bgSigunguId === b.sigungu.id,
      unlockedAt: toKstIso(b.unlockedAt),
    })),
  };
}

/** CHAR-03 꾸미기 저장 (보낸 칸만, null = 해제). 가진 아이템·얻은 배경만 */
export async function saveAppearance(userId: bigint, body: AppearanceBody) {
  const data: Prisma.MukkaebiUncheckedUpdateInput = {};
  const entries = Object.entries(body).filter(([, v]) => v !== undefined);
  if (entries.length === 0) throw new AppError(MukkaebiError.NO_FIELDS_TO_UPDATE);
  for (const [slot, value] of entries) {
    if (slot === 'bgSigunguId') {
      if (value !== null) {
        const unlocked = await prisma.memberRegionBackground.findUnique({
          where: { userId_sigunguId: { userId, sigunguId: value } },
        });
        if (!unlocked) throw new AppError(MukkaebiError.BACKGROUND_LOCKED);
      }
      data.bgSigunguId = value;
      continue;
    }
    const category = SLOT_CATEGORY[slot as keyof typeof SLOT_CATEGORY];
    if (value !== null) {
      const owned = await prisma.memberItem.findUnique({
        where: { userId_itemId: { userId, itemId: value } },
        include: { item: { select: { category: true } } },
      });
      if (!owned || owned.quantity <= 0) throw new AppError(MukkaebiError.ITEM_NOT_OWNED);
      if (owned.item.category !== category) throw new AppError(MukkaebiError.INVALID_ITEM_SLOT);
    }
    (data as Record<string, number | null>)[slot] = value;
  }
  await prisma.mukkaebi.upsert({
    where: { userId },
    update: data,
    create: { userId, ...(data as object) },
  });
  const view = await loadMukkaebi(userId);
  return { equipped: view.equipped, background: view.background };
}

/** CHAR-07 도감 (성장 단계 · 아이템 · 구 배경) */
export async function getCollection(userId: bigint) {
  const [view, items, owned, sigungus, backgrounds, levels] = await Promise.all([
    loadMukkaebi(userId),
    prisma.item.findMany({
      where: { status: 'A' },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    }),
    prisma.memberItem.findMany({
      where: { userId, quantity: { gt: 0 } },
      select: { itemId: true },
    }),
    prisma.region.findMany({
      where: { level: 2 },
      orderBy: { code: 'asc' },
      select: { id: true, name: true, bgKey: true },
    }),
    prisma.memberRegionBackground.findMany({ where: { userId }, select: { sigunguId: true } }),
    prisma.levelPolicy.findMany({
      orderBy: { level: 'asc' },
      select: { level: true, stage: true },
    }),
  ]);
  const ownedIds = new Set(owned.map((o) => o.itemId));
  const unlocked = new Set(backgrounds.map((b) => b.sigunguId));
  const firstLevelOf = new Map<string, number>();
  for (const l of levels) if (!firstLevelOf.has(l.stage)) firstLevelOf.set(l.stage, l.level);
  const stages = ['E', 'B', 'K', 'A'].map((code) => ({
    stage: STAGE_API[code],
    name: STAGE_NAME[code],
    fromLevel: firstLevelOf.get(code) ?? null,
    reached: view.level >= (firstLevelOf.get(code) ?? Infinity),
    isCurrent: STAGE_API[code] === view.stage,
  }));
  const nextGoal = items
    .filter((i) => i.unlockType === 'P' && i.price !== null && !ownedIds.has(i.id))
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0];
  return {
    collectedCount: ownedIds.size + unlocked.size,
    totalCount: items.length + sigungus.length,
    stages,
    items: items.map((i) => ({
      itemId: i.id,
      code: i.code,
      name: i.name,
      category: i.category,
      owned: ownedIds.has(i.id),
      // 모으지 않은 것은 실루엣으로 보여 주므로 이름과 얻는 방법만
      howToGet: i.unlockType === 'P' ? `${i.price ?? 0}P로 구매` : (i.description ?? null),
    })),
    backgrounds: sigungus.map((g) => ({
      sigunguId: g.id,
      sigunguName: g.name,
      bgKey: g.bgKey,
      unlocked: unlocked.has(g.id),
    })),
    nextGoal: nextGoal ? { itemId: nextGoal.id, name: nextGoal.name, price: nextGoal.price } : null,
  };
}

type CelebrationType = 'LEVEL_UP' | 'TIER_UP' | 'BACKGROUND' | 'ACHIEVEMENT' | 'SEASON_RESULT';

/** CHAR-08 아직 보지 않은 축하 이벤트 (오래된 순) */
export async function listCelebrations(userId: bigint) {
  const season = await findCurrentSeason();
  const [mukkaebi, stats, backgrounds, achievements, results] = await Promise.all([
    prisma.mukkaebi.findUnique({ where: { userId } }),
    season
      ? prisma.seasonRegionStat.findMany({
          where: { userId, seasonId: season.id },
          include: { sigungu: { select: { name: true } } },
        })
      : [],
    prisma.memberRegionBackground.findMany({
      where: { userId, seenAt: null },
      include: { sigungu: { select: { id: true, name: true, bgKey: true } } },
    }),
    prisma.memberAchievement.findMany({
      where: { userId, seenAt: null },
      include: {
        achievement: {
          select: { id: true, name: true, description: true, rewardPoint: true, iconKey: true },
        },
      },
    }),
    prisma.seasonResult.findMany({
      where: { userId, seenAt: null },
      include: {
        season: { select: { seasonNo: true } },
        bestSigungu: { select: { name: true } },
        rewardClubItem: { select: { code: true, name: true } },
      },
    }),
  ]);
  const items: {
    celebrationId: string;
    type: CelebrationType;
    occurredAt: Date;
    data: Record<string, unknown>;
  }[] = [];
  if (mukkaebi && mukkaebi.level > mukkaebi.celebratedLevel) {
    const view = await loadMukkaebi(userId);
    items.push({
      celebrationId: `LEVEL_UP:${mukkaebi.level}`,
      type: 'LEVEL_UP',
      occurredAt: mukkaebi.updateDate ?? new Date(),
      data: {
        fromLevel: mukkaebi.celebratedLevel,
        toLevel: mukkaebi.level,
        stage: view.stage,
        stageName: view.stageName,
      },
    });
  }
  // 티어가 내려간 행은 축하하지 않고 기준만 맞춘다
  const dropped = stats.filter(
    (s) => TIER_ORDER[s.tier as TierCode] < TIER_ORDER[s.celebratedTier as TierCode],
  );
  for (const s of dropped)
    await prisma.seasonRegionStat.update({ where: { id: s.id }, data: { celebratedTier: s.tier } });
  for (const s of stats) {
    if (TIER_ORDER[s.tier as TierCode] <= TIER_ORDER[s.celebratedTier as TierCode]) continue;
    items.push({
      celebrationId: `TIER_UP:${s.id}`,
      type: 'TIER_UP',
      occurredAt: s.updateDate ?? new Date(),
      data: {
        sigunguId: s.sigunguId,
        sigunguName: s.sigungu.name,
        from: TIER_API[s.celebratedTier as TierCode],
        to: TIER_API[s.tier as TierCode],
        tierTitle: tierTitle(s.sigungu.name, s.tier as TierCode),
        rank: s.rankNo,
      },
    });
  }
  for (const b of backgrounds) {
    items.push({
      celebrationId: `BACKGROUND:${b.id}`,
      type: 'BACKGROUND',
      occurredAt: b.unlockedAt,
      data: { sigunguId: b.sigungu.id, sigunguName: b.sigungu.name, bgKey: b.sigungu.bgKey },
    });
  }
  for (const a of achievements) {
    items.push({
      celebrationId: `ACHIEVEMENT:${a.id}`,
      type: 'ACHIEVEMENT',
      occurredAt: a.achievedAt,
      data: {
        achievementId: a.achievement.id,
        name: a.achievement.name,
        description: a.achievement.description,
        iconKey: a.achievement.iconKey,
        rewardPoint: a.achievement.rewardPoint,
      },
    });
  }
  for (const r of results) {
    items.push({
      celebrationId: `SEASON_RESULT:${r.id}`,
      type: 'SEASON_RESULT',
      occurredAt: r.regDate,
      data: {
        seasonNo: r.season.seasonNo,
        tierTitle: tierTitle(r.bestSigungu.name, r.bestTier as TierCode),
        rank: r.bestRankNo,
        topPercent: r.bestTopPercent?.toNumber() ?? null,
        conquestTotal: r.conquestTotal,
        rewardPoint: r.rewardPoint,
        rewardClubItem: r.rewardClubItem,
      },
    });
  }
  items.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return { items: items.map((i) => ({ ...i, occurredAt: toKstIso(i.occurredAt) })) };
}

/** CHAR-09 축하 화면 확인 (다시 뜨지 않게) */
export async function markCelebrationSeen(userId: bigint, celebrationId: string, now = new Date()) {
  const [type, rawId] = celebrationId.split(':') as [CelebrationType, string];
  const id = BigInt(rawId);
  let count = 0;
  if (type === 'LEVEL_UP') {
    ({ count } = await prisma.mukkaebi.updateMany({
      where: { userId, level: { gte: Number(id) } },
      data: { celebratedLevel: Number(id) },
    }));
  } else if (type === 'TIER_UP') {
    const stat = await prisma.seasonRegionStat.findUnique({ where: { id } });
    if (stat?.userId === userId) {
      ({ count } = await prisma.seasonRegionStat.updateMany({
        where: { id },
        data: { celebratedTier: stat.tier },
      }));
    }
  } else if (type === 'BACKGROUND') {
    ({ count } = await prisma.memberRegionBackground.updateMany({
      where: { id, userId },
      data: { seenAt: now },
    }));
  } else if (type === 'ACHIEVEMENT') {
    ({ count } = await prisma.memberAchievement.updateMany({
      where: { id, userId },
      data: { seenAt: now },
    }));
  } else {
    ({ count } = await prisma.seasonResult.updateMany({
      where: { id, userId },
      data: { seenAt: now },
    }));
  }
  if (count === 0) throw new AppError(MukkaebiError.CELEBRATION_NOT_FOUND);
  return { celebrationId, seen: true };
}

/** CHAR-10 합성 (황금 방망이 3개 → 전설의 방망이) */
export async function craftItem(userId: bigint, itemId: number, now = new Date()) {
  const recipe = await prisma.itemRecipe.findUnique({
    where: { resultItemId: itemId },
    include: { resultItem: true, materialItem: true },
  });
  if (!recipe) throw new AppError(MukkaebiError.RECIPE_NOT_FOUND);
  const result = await prisma.$transaction(async (tx) => {
    const [material] = await tx.$queryRaw<{ id: bigint; quantity: number }[]>`
      SELECT id, quantity FROM member_item WHERE user_id = ${userId} AND item_id = ${recipe.materialItemId} FOR UPDATE`;
    if (!material || material.quantity < recipe.materialCount) {
      throw new AppError(MukkaebiError.NOT_ENOUGH_MATERIAL, undefined, {
        have: material?.quantity ?? 0,
        need: recipe.materialCount,
      });
    }
    await tx.memberItem.update({
      where: { id: material.id },
      data: { quantity: { decrement: recipe.materialCount } },
    });
    const made = await tx.memberItem.upsert({
      where: { userId_itemId: { userId, itemId } },
      update: { quantity: { increment: 1 }, seenAt: null },
      create: { userId, itemId, acquiredType: 'M', acquiredAt: now },
    });
    await notify(
      tx,
      userId,
      {
        category: 'MUKKAEBI',
        type: 'NEW_ITEM',
        title: `${recipe.resultItem.name}을 만들었어요!`,
        content: `${recipe.materialItem.name} ${recipe.materialCount}개를 합쳤어요`,
        refType: 'ITEM',
        refId: itemId,
      },
      now,
    );
    return { quantity: made.quantity, materialLeft: material.quantity - recipe.materialCount };
  });
  return {
    item: {
      itemId: recipe.resultItem.id,
      code: recipe.resultItem.code,
      name: recipe.resultItem.name,
      quantity: result.quantity,
    },
    material: {
      itemId: recipe.materialItem.id,
      name: recipe.materialItem.name,
      quantity: result.materialLeft,
    },
  };
}
