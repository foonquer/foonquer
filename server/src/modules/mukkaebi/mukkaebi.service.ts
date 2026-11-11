import { lockMember } from '../../common/db';
import { AppError } from '../../common/errors/app-error';
import { withObjectParticle } from '../../common/josa';
import { findCurrentSeason } from '../../common/season';
import { toKstIso } from '../../common/time';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { notify } from '../notification/notify';
import { addPoint } from '../reward/reward.service';
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

const SLOT_OF_CATEGORY = Object.fromEntries(
  Object.entries(SLOT_CATEGORY).map(([slot, category]) => [category, slot]),
) as Record<string, keyof typeof SLOT_CATEGORY | undefined>;

/** CHAR-01 내 먹깨비 */
export async function getMyMukkaebi(userId: bigint) {
  const [view, member, newItems, unopenedBoxes] = await Promise.all([
    loadMukkaebi(userId),
    prisma.member.findUniqueOrThrow({ where: { id: userId }, select: { pointBalance: true } }),
    prisma.memberItem.count({ where: { userId, seenAt: null, quantity: { gt: 0 } } }),
    prisma.memberItemBox.count({ where: { userId, status: 'U' } }),
  ]);
  const { celebratedLevel: _celebrated, ...rest } = view;
  return {
    ...rest,
    pointBalance: member.pointBalance,
    newItemCount: newItems,
    unopenedBoxCount: unopenedBoxes,
  };
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
      rarity: m.item.rarity,
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
      rarity: i.rarity,
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
    const [view, itemBoxCount] = await Promise.all([
      loadMukkaebi(userId),
      prisma.memberItemBox.count({
        where: {
          userId,
          source: 'LEVEL_UP',
          sourceRef: { gt: mukkaebi.celebratedLevel, lte: mukkaebi.level },
        },
      }),
    ]);
    items.push({
      celebrationId: `LEVEL_UP:${mukkaebi.level}`,
      type: 'LEVEL_UP',
      occurredAt: mukkaebi.updateDate ?? new Date(),
      data: {
        fromLevel: mukkaebi.celebratedLevel,
        toLevel: mukkaebi.level,
        stage: view.stage,
        stageName: view.stageName,
        // 성장 단계가 바뀌면 "아이템 상자 1개" (CHAR-05·06)
        itemBoxCount,
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
    const level = Number(id);
    const m = await prisma.mukkaebi.findUnique({ where: { userId } });
    if (m && m.level >= level) {
      count = 1;
      // 이미 더 높은 레벨까지 확인했으면 낮추지 않는다
      if (m.celebratedLevel < level)
        await prisma.mukkaebi.updateMany({
          where: { userId, celebratedLevel: { lt: level } },
          data: { celebratedLevel: level },
        });
    }
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
    // 재료를 다 쓰면 착용 중이던 칸도 비운다 (가지지 않은 아이템을 착용한 상태가 되지 않게)
    const slot = SLOT_OF_CATEGORY[recipe.materialItem.category];
    if (material.quantity === recipe.materialCount && slot) {
      await tx.mukkaebi.updateMany({
        where: { userId, [slot]: recipe.materialItemId },
        data: { [slot]: null },
      });
    }
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
        title: `${withObjectParticle(recipe.resultItem.name)} 만들었어요!`,
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

/** 아이템 상자 제목 (피그마 "LV.10 성장 보상") */
function itemBoxTitle(box: { source: string; sourceRef: number }) {
  if (box.source === 'LEVEL_UP') return `LV.${box.sourceRef} 성장 보상`;
  if (box.source === 'QUEST_WEEK') return '주간 퀘스트 상자';
  return '아이템 상자';
}

/** CHAR-05 내 아이템 상자 (안 연 것 먼저, 최신순) */
export async function listItemBoxes(userId: bigint) {
  const boxes = await prisma.memberItemBox.findMany({
    where: { userId },
    orderBy: [{ status: 'desc' }, { id: 'desc' }],
    include: {
      resultItem: { select: { id: true, code: true, name: true, category: true, rarity: true } },
    },
  });
  return {
    unopenedCount: boxes.filter((b) => b.status === 'U').length,
    items: boxes.map((b) => ({
      boxId: b.id,
      title: itemBoxTitle(b),
      opened: b.status === 'O',
      receivedAt: toKstIso(b.regDate),
      openedAt: b.openedAt ? toKstIso(b.openedAt) : null,
      resultItem: b.resultItem
        ? {
            itemId: b.resultItem.id,
            code: b.resultItem.code,
            name: b.resultItem.name,
            category: b.resultItem.category,
            rarity: b.resultItem.rarity,
          }
        : null,
      resultPoint: b.resultPoint,
    })),
  };
}

/** 아이템 상자에서 레어(R 이상)가 나올 확률 (피그마 "레어 등장 20%") */
export const ITEM_BOX_RARE_RATE = 0.2;
/** 주간 퀘스트 상자는 레어가 나올 확률이 평소보다 높다 (피그마 12. Q5, 숫자는 나중에 조정) */
export const QUEST_BOX_RARE_RATE = 0.4;
const BOX_CATEGORIES = ['HAT', 'FACE', 'PROP'];

/**
 * CHAR-06 아이템 상자 열기 — 아직 없는 모자·얼굴·소품(상점 아이템) 중 하나. 레어는 20%(주간 퀘스트 상자는 40%).
 * 다 가졌으면 reward_policy ITEM_BOX만큼 먹포인트. random은 테스트에서 바꿔 끼운다
 */
export async function openItemBox(
  userId: bigint,
  boxId: bigint,
  now = new Date(),
  random: () => number = Math.random,
) {
  const result = await prisma.$transaction(async (tx) => {
    const [box] = await tx.$queryRaw<{ user_id: bigint; status: string; source: string }[]>`
      SELECT user_id, status, source FROM member_item_box WHERE id = ${boxId} FOR UPDATE`;
    if (!box || box.user_id !== userId) throw new AppError(MukkaebiError.ITEM_BOX_NOT_FOUND);
    if (box.status !== 'U') throw new AppError(MukkaebiError.ITEM_BOX_ALREADY_OPENED);
    // 상점 구매와 동시에 같은 아이템을 받지 않게 회원 행도 잠근다 (구매도 같은 순서로 잠근다)
    await lockMember(tx, userId);
    const owned = await tx.memberItem.findMany({
      where: { userId, quantity: { gt: 0 } },
      select: { itemId: true },
    });
    const candidates = await tx.item.findMany({
      where: {
        status: 'A',
        unlockType: 'P',
        category: { in: BOX_CATEGORIES },
        id: { notIn: owned.map((o) => o.itemId) },
      },
      orderBy: { id: 'asc' },
    });
    const rare = candidates.filter((i) => i.rarity !== 'N');
    const normal = candidates.filter((i) => i.rarity === 'N');
    const pool =
      rare.length > 0 &&
      (normal.length === 0 ||
        random() < (box.source === 'QUEST_WEEK' ? QUEST_BOX_RARE_RATE : ITEM_BOX_RARE_RATE))
        ? rare
        : normal;
    const item = pool.length > 0 ? pool[Math.floor(random() * pool.length)] : null;

    let point: number | null = null;
    if (item) {
      await tx.memberItem.upsert({
        where: { userId_itemId: { userId, itemId: item.id } },
        update: { quantity: 1, acquiredType: 'B', acquiredAt: now, seenAt: null },
        create: { userId, itemId: item.id, acquiredType: 'B', acquiredAt: now },
      });
    } else {
      const policy = await tx.rewardPolicy.findUnique({ where: { reason: 'ITEM_BOX' } });
      point = policy?.point ?? 0;
      await addPoint(
        tx,
        userId,
        point,
        'ITEM_BOX',
        '아이템 상자',
        { type: 'ITEM_BOX', id: boxId },
        now,
      );
    }
    await tx.memberItemBox.update({
      where: { id: boxId },
      data: { status: 'O', resultItemId: item?.id ?? null, resultPoint: point, openedAt: now },
    });
    return { item, point };
  });
  const unopenedCount = await prisma.memberItemBox.count({ where: { userId, status: 'U' } });
  const { item, point } = result;
  return {
    boxId,
    item: item
      ? {
          itemId: item.id,
          code: item.code,
          name: item.name,
          category: item.category,
          rarity: item.rarity,
          // "상점에서 400P인 아이템이에요"
          price: item.price,
        }
      : null,
    point,
    unopenedCount,
  };
}
