import { lockMember } from '../../common/db';
import { AppError } from '../../common/errors/app-error';
import { toPageResult } from '../../common/pagination';
import { kstStartOfMonth, toKstDate, toKstIso } from '../../common/time';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { spendPoint } from '../reward/reward.service';
import type { PointHistoryQuery, PurchaseBody, ShopQuery } from './mukkaebi.schema';
import { MukkaebiError } from './mukkaebi.errors';

// 상점 (2026-10-06 회의: 먹포인트로 사는 것은 모자·얼굴·소품). 왕관·밤하늘·방망이는 명예 아이템이라 살 수 없다

const SLOT_OF: Record<string, 'hatItemId' | 'faceItemId' | 'propItemId'> = {
  HAT: 'hatItemId',
  FACE: 'faceItemId',
  PROP: 'propItemId',
};

type ItemRow = Prisma.ItemGetPayload<object>;

function isOnSale(item: ItemRow, now: Date) {
  return (
    item.status === 'A' &&
    item.unlockType === 'P' &&
    item.price !== null &&
    (!item.saleStart || item.saleStart <= now) &&
    (!item.saleEnd || item.saleEnd > now)
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
    price: item.price,
    badge: item.badge,
    purchasable,
    owned: own.owned.has(item.id),
    equipped: own.equipped.has(item.id),
    // 명예 아이템은 얻는 방법을 보여 준다
    unlockCondition: purchasable ? null : item.description,
  };
}

/** SHOP-01 상점 목록 */
export async function listShopItems(userId: bigint, query: ShopQuery, now = new Date()) {
  const where: Prisma.ItemWhereInput =
    query.category === 'HONOR'
      ? { status: 'A', unlockType: { in: ['S', 'M'] } }
      : { status: 'A', category: query.category };
  const [items, own] = await Promise.all([
    prisma.item.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    ownership(userId),
  ]);
  return {
    category: query.category,
    pointBalance: own.balance,
    items: items.map((i) => toShopItem(i, own, now)),
  };
}

/** SHOP-02 상품 상세 (구매 확인 시트) */
export async function getShopItem(userId: bigint, itemId: number, now = new Date()) {
  const item = await prisma.item.findUnique({ where: { id: itemId } });
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
