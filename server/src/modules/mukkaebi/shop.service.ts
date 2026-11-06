import { lockMember } from '../../common/db';
import { AppError } from '../../common/errors/app-error';
import { toPageResult } from '../../common/pagination';
import { kstStartOfMonth, toKstDate, toKstIso } from '../../common/time';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { spendPoint } from '../reward/reward.service';
import type {
  PointHistoryQuery,
  PurchaseBody,
  SetPurchaseBody,
  ShopQuery,
} from './mukkaebi.schema';
import { MukkaebiError } from './mukkaebi.errors';

// 상점 (2026-10-06 회의: 먹포인트로 사는 것은 모자·얼굴·소품). 왕관·밤하늘·방망이는 명예 아이템이라 살 수 없다
// v1.3: 왕관·밤하늘은 업적 보상, 방망이는 시즌 보상(황금은 업적 보상이기도), 세트는 상점 배너

const SLOT_OF: Record<string, 'hatItemId' | 'faceItemId' | 'propItemId'> = {
  HAT: 'hatItemId',
  FACE: 'faceItemId',
  PROP: 'propItemId',
};

const ITEM_INCLUDE = { requiredAchievement: { select: { id: true, name: true } } } as const;
type ItemRow = Prisma.ItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

function inSalePeriod(row: { saleStart: Date | null; saleEnd: Date | null }, now: Date) {
  return (!row.saleStart || row.saleStart <= now) && (!row.saleEnd || row.saleEnd > now);
}

function isOnSale(item: Prisma.ItemGetPayload<object>, now: Date) {
  return (
    item.status === 'A' && item.unlockType === 'P' && item.price !== null && inSalePeriod(item, now)
  );
}

async function ownership(userId: bigint) {
  const [owned, mukkaebi, member] = await Promise.all([
    prisma.memberItem.findMany({
      where: { userId, quantity: { gt: 0 } },
      select: { itemId: true },
    }),
    prisma.mukkaebi.findUnique({ where: { userId } }),
    prisma.member.findUniqueOrThrow({ where: { id: userId }, select: { pointBalance: true } }),
  ]);
  const equipped = new Set(
    [
      mukkaebi?.hatItemId,
      mukkaebi?.faceItemId,
      mukkaebi?.propItemId,
      mukkaebi?.skinItemId,
      mukkaebi?.clubItemId,
    ].filter((id): id is number => typeof id === 'number'),
  );
  return { owned: new Set(owned.map((o) => o.itemId)), equipped, balance: member.pointBalance };
}

function toShopItem(item: ItemRow, own: Awaited<ReturnType<typeof ownership>>, now: Date) {
  const purchasable = isOnSale(item, now);
  return {
    itemId: item.id,
    code: item.code,
    name: item.name,
    description: item.description,
    category: item.category,
    rarity: item.rarity,
    price: item.price,
    badge: item.badge,
    purchasable,
    owned: own.owned.has(item.id),
    equipped: own.equipped.has(item.id),
    // 명예 아이템은 얻는 방법을 보여 준다
    unlockCondition: purchasable ? null : item.description,
    requiredAchievement: item.requiredAchievement
      ? { achievementId: item.requiredAchievement.id, name: item.requiredAchievement.name }
      : null,
  };
}

/** SHOP-01 상점 목록 */
export async function listShopItems(userId: bigint, query: ShopQuery, now = new Date()) {
  const where: Prisma.ItemWhereInput =
    query.category === 'HONOR'
      ? { status: 'A', unlockType: { in: ['S', 'M', 'A'] } }
      : { status: 'A', category: query.category };
  const [items, own, sets] = await Promise.all([
    prisma.item.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: ITEM_INCLUDE,
    }),
    ownership(userId),
    loadSets(now),
  ]);
  return {
    category: query.category,
    pointBalance: own.balance,
    // 상점 위 추천 배너 (피그마 "딸기 모자 세트 · 450P 550P")
    sets: sets.map((s) => toShopSet(s, own)),
    items: items.map((i) => toShopItem(i, own, now)),
  };
}

const SET_INCLUDE = {
  items: { include: { item: true }, orderBy: { itemId: 'asc' } },
} as const;
type SetRow = Prisma.ItemSetGetPayload<{ include: typeof SET_INCLUDE }>;

async function loadSets(now: Date) {
  const sets = await prisma.itemSet.findMany({
    where: { status: 'A' },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: SET_INCLUDE,
  });
  return sets.filter((s) => inSalePeriod(s, now));
}

function toShopSet(set: SetRow, own: Awaited<ReturnType<typeof ownership>>) {
  const ownedAny = set.items.some((i) => own.owned.has(i.itemId));
  return {
    setId: set.id,
    code: set.code,
    name: set.name,
    description: set.description,
    price: set.price,
    // 따로 사면 (취소선 가격)
    originalPrice: set.items.reduce((sum, i) => sum + (i.item.price ?? 0), 0),
    badge: set.badge,
    items: set.items.map((i) => ({
      itemId: i.item.id,
      code: i.item.code,
      name: i.item.name,
      category: i.item.category,
      rarity: i.item.rarity,
      owned: own.owned.has(i.itemId),
    })),
    // 세트 아이템을 하나라도 가졌으면 세트로는 못 산다
    purchasable: !ownedAny,
    canBuy: !ownedAny && own.balance >= set.price,
  };
}

/** SHOP-02 상품 상세 (구매 확인 시트) */
export async function getShopItem(userId: bigint, itemId: number, now = new Date()) {
  const item = await prisma.item.findUnique({ where: { id: itemId }, include: ITEM_INCLUDE });
  if (!item || item.status !== 'A') throw new AppError(MukkaebiError.ITEM_NOT_FOUND);
  const own = await ownership(userId);
  const view = toShopItem(item, own, now);
  return {
    ...view,
    pointBalance: own.balance,
    balanceAfter: view.purchasable && item.price !== null ? own.balance - item.price : null,
    canBuy: view.purchasable && !view.owned && item.price !== null && own.balance >= item.price,
  };
}

/** SHOP-03 구매 — 잔액 차감·아이템 지급·내역을 한 트랜잭션으로. equipNow면 바로 착용 */
export async function purchaseItem(userId: bigint, body: PurchaseBody, now = new Date()) {
  const item = await prisma.item.findUnique({ where: { id: body.itemId } });
  if (!item || item.status !== 'A') throw new AppError(MukkaebiError.ITEM_NOT_FOUND);
  if (!isOnSale(item, now) || item.price === null)
    throw new AppError(MukkaebiError.ITEM_NOT_FOR_SALE);
  const price = item.price;
  const balance = await prisma.$transaction(async (tx) => {
    // 같은 아이템을 동시에 사면 앞 구매가 끝난 뒤에 가졌는지 다시 본다
    await lockMember(tx, userId);
    const owned = await tx.memberItem.findUnique({
      where: { userId_itemId: { userId, itemId: item.id } },
    });
    if (owned && owned.quantity > 0) throw new AppError(MukkaebiError.ITEM_ALREADY_OWNED);
    const balance = await spendPoint(
      tx,
      userId,
      price,
      'PURCHASE',
      `${item.name} 구매`,
      { type: 'ITEM', id: item.id },
      now,
    );
    await tx.memberItem.upsert({
      where: { userId_itemId: { userId, itemId: item.id } },
      update: { quantity: 1, acquiredType: 'P', acquiredAt: now, seenAt: now },
      create: { userId, itemId: item.id, acquiredType: 'P', acquiredAt: now, seenAt: now },
    });
    const slot = SLOT_OF[item.category];
    if (body.equipNow && slot) {
      await tx.mukkaebi.upsert({
        where: { userId },
        update: { [slot]: item.id },
        create: { userId, [slot]: item.id },
      });
    }
    return balance;
  });
  return {
    itemId: item.id,
    name: item.name,
    price,
    pointBalance: balance,
    equipped: Boolean(body.equipNow && SLOT_OF[item.category]),
  };
}

/** SHOP-04 세트 구매 — 세트 아이템을 하나도 안 가졌을 때만. 차감·지급·내역을 한 트랜잭션으로. equipNow면 바로 착용 */
export async function purchaseSet(userId: bigint, body: SetPurchaseBody, now = new Date()) {
  const set = await prisma.itemSet.findUnique({ where: { id: body.setId }, include: SET_INCLUDE });
  if (!set || set.status !== 'A') throw new AppError(MukkaebiError.SET_NOT_FOUND);
  if (!inSalePeriod(set, now) || set.items.length === 0)
    throw new AppError(MukkaebiError.SET_NOT_FOR_SALE);
  const itemIds = set.items.map((i) => i.itemId);
  const balance = await prisma.$transaction(async (tx) => {
    await lockMember(tx, userId);
    const owned = await tx.memberItem.count({
      where: { userId, itemId: { in: itemIds }, quantity: { gt: 0 } },
    });
    if (owned > 0) throw new AppError(MukkaebiError.SET_ITEM_OWNED);
    const balance = await spendPoint(
      tx,
      userId,
      set.price,
      'PURCHASE',
      `${set.name} 구매`,
      { type: 'ITEM_SET', id: set.id },
      now,
    );
    const equip: Record<string, number> = {};
    for (const { item } of set.items) {
      await tx.memberItem.upsert({
        where: { userId_itemId: { userId, itemId: item.id } },
        update: { quantity: 1, acquiredType: 'P', acquiredAt: now, seenAt: now },
        create: { userId, itemId: item.id, acquiredType: 'P', acquiredAt: now, seenAt: now },
      });
      const slot = SLOT_OF[item.category];
      if (slot) equip[slot] = item.id;
    }
    if (body.equipNow && Object.keys(equip).length > 0) {
      await tx.mukkaebi.upsert({
        where: { userId },
        update: equip,
        create: { userId, ...equip },
      });
    }
    return balance;
  });
  return {
    setId: set.id,
    name: set.name,
    price: set.price,
    items: set.items.map((i) => ({
      itemId: i.item.id,
      name: i.item.name,
      category: i.item.category,
    })),
    pointBalance: balance,
    equipped: Boolean(body.equipNow),
  };
}

/** POINT-01 먹포인트 잔액과 이번 달 모은·쓴 포인트 */
export async function getMyPoints(userId: bigint, now = new Date()) {
  const [member, earned, spent] = await Promise.all([
    prisma.member.findUniqueOrThrow({ where: { id: userId }, select: { pointBalance: true } }),
    prisma.pointHistory.aggregate({
      where: { userId, amount: { gt: 0 }, regDate: { gte: kstStartOfMonth(now) } },
      _sum: { amount: true },
    }),
    prisma.pointHistory.aggregate({
      where: { userId, amount: { lt: 0 }, regDate: { gte: kstStartOfMonth(now) } },
      _sum: { amount: true },
    }),
  ]);
  return {
    pointBalance: member.pointBalance,
    monthEarned: earned._sum.amount ?? 0,
    monthSpent: -(spent._sum.amount ?? 0),
  };
}

/** POINT-02 먹포인트 내역 (최신순, 모은/쓴 내역 거르기) */
export async function getPointHistory(userId: bigint, query: PointHistoryQuery) {
  const where: Prisma.PointHistoryWhereInput = {
    userId,
    amount: query.type === 'EARN' ? { gt: 0 } : query.type === 'SPEND' ? { lt: 0 } : undefined,
  };
  const [rows, totalCount] = await Promise.all([
    prisma.pointHistory.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    }),
    prisma.pointHistory.count({ where }),
  ]);
  const items = rows.map((r) => ({
    pointHistoryId: r.id,
    amount: r.amount,
    balanceAfter: r.balanceAfter,
    reason: r.reason,
    title: r.title,
    date: toKstDate(r.regDate),
    regDate: toKstIso(r.regDate),
  }));
  return toPageResult(items, { ...query, totalCount });
}
