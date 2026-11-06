import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { openItemBox } from '../../src/modules/mukkaebi/mukkaebi.service';
import { addExp, addPoint } from '../../src/modules/reward/reward.service';
import { requiredExpOf } from '../../prisma/seed-data';
import { resetDb } from '../helpers/db';
import { bearer, createActiveSeason, createMember } from '../helpers/fixtures';
import { conquerMany, itemId } from '../helpers/game';

const app = createApp();
const api = (userId: bigint) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set('Authorization', bearer(userId)),
  put: (path: string, body: object) =>
    request(app).put(`/api/v1${path}`).set('Authorization', bearer(userId)).send(body),
  post: (path: string, body: object = {}) =>
    request(app).post(`/api/v1${path}`).set('Authorization', bearer(userId)).send(body),
  patch: (path: string, body: object = {}) =>
    request(app).patch(`/api/v1${path}`).set('Authorization', bearer(userId)).send(body),
});

beforeEach(async () => {
  await resetDb();
});

async function give(userId: bigint, point: number) {
  await prisma.$transaction((tx) =>
    addPoint(tx, userId, point, 'ADMIN', '테스트 지급', { type: 'ADMIN', id: point }),
  );
}

describe('SHOP·POINT 상점과 먹포인트', () => {
  it('모자 목록 → 구매(잔액 차감·바로 착용) → 다시 사면 409, 모자라면 409 POINT_NOT_ENOUGH', async () => {
    const me = await createMember();
    await give(me.id, 500);
    const hats = await api(me.id).get('/shop/items?category=HAT');
    expect(hats.body.data.pointBalance).toBe(500);
    const strawberry = hats.body.data.items.find(
      (i: { code: string }) => i.code === 'HAT_STRAWBERRY',
    );
    expect(strawberry).toMatchObject({ price: 300, purchasable: true, owned: false });
    expect(
      hats.body.data.items.find((i: { code: string }) => i.code === 'HAT_CROWN'),
    ).toMatchObject({ purchasable: false });

    const detail = await api(me.id).get(`/shop/items/${strawberry.itemId}`);
    expect(detail.body.data).toMatchObject({ balanceAfter: 200, canBuy: true });

    const bought = await api(me.id).post('/shop/purchases', {
      itemId: strawberry.itemId,
      equipNow: true,
    });
    expect(bought.body.data).toMatchObject({ pointBalance: 200, equipped: true });
    expect((await prisma.mukkaebi.findUniqueOrThrow({ where: { userId: me.id } })).hatItemId).toBe(
      strawberry.itemId,
    );
    expect(bought.body.message).toBe('딸기 모자를 샀어요!');
    expect(
      await prisma.memberItem.findUnique({
        where: { userId_itemId: { userId: me.id, itemId: strawberry.itemId } },
      }),
    ).toMatchObject({ quantity: 1, acquiredType: 'P' });
    const again = await api(me.id).post('/shop/purchases', { itemId: strawberry.itemId });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ITEM_ALREADY_OWNED');

    const acorn = await itemId('HAT_ACORN');
    const poor = await api(me.id).post('/shop/purchases', { itemId: acorn });
    expect(poor.status).toBe(409);
    expect(poor.body).toMatchObject({ code: 'POINT_NOT_ENOUGH', data: { shortage: 400 } });
    const crown = await api(me.id).post('/shop/purchases', { itemId: await itemId('HAT_CROWN') });
    expect(crown.status).toBe(400);
    expect(crown.body.code).toBe('ITEM_NOT_FOR_SALE');
    expect((await api(me.id).get('/shop/items/999999')).status).toBe(404);
    expect((await api(me.id).get('/shop/items?category=SKIN')).body.code).toBe(
      'INVALID_ITEM_CATEGORY',
    );
    expect((await request(app).get('/api/v1/shop/items')).status).toBe(401);

    const points = await api(me.id).get('/points/me');
    expect(points.body.data).toMatchObject({
      pointBalance: 200,
      monthEarned: 500,
      monthSpent: 300,
    });
    const spend = await api(me.id).get('/points/me/history?type=SPEND');
    expect(spend.body.data.items).toHaveLength(1);
    expect(spend.body.data.items[0]).toMatchObject({ amount: -300, title: '딸기 모자 구매' });
  });

  it('같은 아이템을 동시에 사도 한 번만 사고 포인트도 한 번만 뺀다', async () => {
    const me = await createMember();
    await give(me.id, 1000);
    const hat = await itemId('HAT_STRAWBERRY');
    const results = await Promise.all(
      [1, 2, 3].map(() => api(me.id).post('/shop/purchases', { itemId: hat })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: me.id } })).pointBalance).toBe(
      700,
    );
    expect(await prisma.pointHistory.count({ where: { userId: me.id, reason: 'PURCHASE' } })).toBe(
      1,
    );
  });
});

describe('CHAR 먹깨비', () => {
  it('내 먹깨비, 보유 아이템(새로 얻음 표시), 꾸미기 저장(가진 것만, 칸 확인)', async () => {
    const me = await createMember();
    const hat = await itemId('HAT_SPROUT');
    const face = await itemId('FACE_MUSTACHE');
    await prisma.memberItem.createMany({
      data: [
        { userId: me.id, itemId: hat, acquiredType: 'P' },
        { userId: me.id, itemId: face, acquiredType: 'P' },
      ],
    });
    const mine = await api(me.id).get('/characters/me');
    expect(mine.body.data).toMatchObject({
      level: 1,
      stage: 'EGG',
      newItemCount: 2,
      equipped: { hat: null },
    });

    const items = await api(me.id).get('/characters/me/items?category=HAT');
    expect(items.body.data.items).toEqual([
      expect.objectContaining({ code: 'HAT_SPROUT', isNew: true }),
    ]);
    const again = await api(me.id).get('/characters/me/items?category=HAT');
    expect(again.body.data.items[0].isNew).toBe(false);

    const saved = await api(me.id).put('/characters/me/appearance', {
      hatItemId: hat,
      faceItemId: face,
    });
    expect(saved.body.data.equipped).toMatchObject({
      hat: { code: 'HAT_SPROUT' },
      face: { code: 'FACE_MUSTACHE' },
    });
    const notOwned = await api(me.id).put('/characters/me/appearance', {
      propItemId: await itemId('PROP_MIC'),
    });
    expect(notOwned.status).toBe(403);
    expect(notOwned.body.code).toBe('ITEM_NOT_OWNED');
    expect((await api(me.id).put('/characters/me/appearance', {})).body.code).toBe(
      'NO_FIELDS_TO_UPDATE',
    );
    expect((await api(me.id).put('/characters/me/appearance', { propItemId: hat })).body.code).toBe(
      'INVALID_ITEM_SLOT',
    );
    expect((await api(me.id).put('/characters/me/appearance', { bgSigunguId: 1 })).body.code).toBe(
      'BACKGROUND_LOCKED',
    );
    const off = await api(me.id).put('/characters/me/appearance', { hatItemId: null });
    expect(off.body.data.equipped.hat).toBeNull();

    const collection = await api(me.id).get('/characters/me/collection');
    expect(collection.body.data).toMatchObject({ collectedCount: 2, totalCount: 25 + 25 });
    expect(collection.body.data.nextGoal).toMatchObject({ name: '반짝 별 스티커', price: 150 });
  });

  it('축하 이벤트: 레벨업·티어 상승·업적을 오래된 순으로 주고, 확인하면 다시 뜨지 않는다', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    await conquerMany(me.id, season.id, 1);
    await prisma.mukkaebi.update({ where: { userId: me.id }, data: { level: 3, exp: 220 } });

    const list = await api(me.id).get('/users/me/celebrations');
    const items = list.body.data.items as { type: string; occurredAt: string }[];
    expect(items.map((i) => i.type).sort()).toEqual(['ACHIEVEMENT', 'LEVEL_UP', 'TIER_UP']);
    const times = items.map((i) => i.occurredAt);
    expect(times).toEqual([...times].sort());
    for (const item of list.body.data.items as { celebrationId: string }[]) {
      const seen = await api(me.id).patch(`/users/me/celebrations/${item.celebrationId}/seen`);
      expect(seen.status).toBe(200);
    }
    expect((await api(me.id).get('/users/me/celebrations')).body.data.items).toHaveLength(0);
    expect((await api(me.id).patch('/users/me/celebrations/ACHIEVEMENT:999/seen')).body.code).toBe(
      'CELEBRATION_NOT_FOUND',
    );

    // 이미 LV.3까지 확인했는데 LV.1을 확인해도 낮아지지 않는다
    expect((await api(me.id).patch('/users/me/celebrations/LEVEL_UP:1/seen')).status).toBe(200);
    expect(
      (await prisma.mukkaebi.findUniqueOrThrow({ where: { userId: me.id } })).celebratedLevel,
    ).toBe(3);
    // 범위를 넘는 숫자는 500이 아니라 404
    for (const id of ['LEVEL_UP:99999999999', 'TIER_UP:99999999999999999999']) {
      const res = await api(me.id).patch(`/users/me/celebrations/${id}/seen`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CELEBRATION_NOT_FOUND');
    }
  });

  it('황금 방망이 3개 → 전설의 방망이, 모자라면 409', async () => {
    const me = await createMember();
    const gold = await itemId('CLUB_GOLD');
    const legend = await itemId('CLUB_LEGEND');
    await prisma.memberItem.create({
      data: { userId: me.id, itemId: gold, quantity: 2, acquiredType: 'S' },
    });
    const short = await api(me.id).post(`/characters/me/items/${legend}/craft`);
    expect(short.body).toMatchObject({ code: 'NOT_ENOUGH_MATERIAL', data: { have: 2, need: 3 } });
    expect(short.status).toBe(409);
    await prisma.memberItem.update({
      where: { userId_itemId: { userId: me.id, itemId: gold } },
      data: { quantity: 3 },
    });
    await prisma.mukkaebi.upsert({
      where: { userId: me.id },
      update: { clubItemId: gold },
      create: { userId: me.id, clubItemId: gold },
    });
    const made = await api(me.id).post(`/characters/me/items/${legend}/craft`);
    expect(made.body.message).toBe('전설의 방망이를 만들었어요!');
    expect(made.body.data).toMatchObject({
      item: { code: 'CLUB_LEGEND', quantity: 1 },
      material: { quantity: 0 },
    });
    // 재료를 다 써서 착용 중이던 황금 방망이 칸이 비었다
    expect(
      (await prisma.mukkaebi.findUniqueOrThrow({ where: { userId: me.id } })).clubItemId,
    ).toBeNull();
    expect(
      await prisma.memberItem.findUnique({
        where: { userId_itemId: { userId: me.id, itemId: legend } },
      }),
    ).toMatchObject({ quantity: 1, acquiredType: 'M' });
    expect((await api(me.id).post(`/characters/me/items/${gold}/craft`)).body.code).toBe(
      'RECIPE_NOT_FOUND',
    );
  });
});

async function owns(userId: bigint, codes: string[]) {
  const items = await prisma.item.findMany({
    where: { code: { in: codes } },
    select: { id: true },
  });
  await prisma.memberItem.createMany({
    data: items.map((i) => ({ userId, itemId: i.id, acquiredType: 'P' })),
  });
}

describe('v1.3 아이템 상자 · 세트 · 업적 보상 아이템', () => {
  it('성장 단계가 바뀌는 LV.3·10에 상자를 1개씩 받고, 열면 아직 없는 모자·얼굴·소품이 나온다', async () => {
    const me = await createMember();
    const other = await createMember();
    const up = await prisma.$transaction((tx) =>
      addExp(tx, me.id, requiredExpOf(10), 'ADMIN', { type: 'ADMIN', id: 1 }),
    );
    expect(up.levelUp).toEqual({ from: 1, to: 10, itemBoxCount: 2 });

    const celebrations = await api(me.id).get('/users/me/celebrations');
    expect(
      celebrations.body.data.items.find((i: { type: string }) => i.type === 'LEVEL_UP').data,
    ).toMatchObject({ fromLevel: 1, toLevel: 10, itemBoxCount: 2 });
    expect((await api(me.id).get('/characters/me')).body.data.unopenedBoxCount).toBe(2);

    const boxes = await api(me.id).get('/characters/me/item-boxes');
    expect(boxes.body.data.unopenedCount).toBe(2);
    expect(boxes.body.data.items.map((b: { title: string }) => b.title)).toEqual([
      'LV.10 성장 보상',
      'LV.3 성장 보상',
    ]);
    const [first, second] = boxes.body.data.items as { boxId: string }[];

    expect((await api(other.id).post(`/characters/me/item-boxes/${first.boxId}/open`)).status).toBe(
      404,
    );
    const opened = await api(me.id).post(`/characters/me/item-boxes/${first.boxId}/open`);
    expect(opened.status).toBe(200);
    expect(opened.body.message).toMatch(/얻었어요!$/);
    expect(opened.body.data).toMatchObject({ point: null, unopenedCount: 1 });
    expect(['HAT', 'FACE', 'PROP']).toContain(opened.body.data.item.category);
    expect(opened.body.data.item.price).toBeGreaterThan(0);
    expect(
      await prisma.memberItem.findUnique({
        where: { userId_itemId: { userId: me.id, itemId: opened.body.data.item.itemId } },
      }),
    ).toMatchObject({ quantity: 1, acquiredType: 'B', seenAt: null });
    const again = await api(me.id).post(`/characters/me/item-boxes/${first.boxId}/open`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ITEM_BOX_ALREADY_OPENED');

    // 레어 20%: 0.1이면 레어, 레어를 다 가졌으면 0.1이어도 일반
    const rare = await openItemBox(me.id, BigInt(second.boxId), new Date(), () => 0.1);
    expect(rare.item?.rarity).toBe('R');
    expect(rare.unopenedCount).toBe(0);
  });

  it('레어를 다 가졌으면 일반, 모자·얼굴·소품을 다 가졌으면 먹포인트를 준다', async () => {
    const me = await createMember();
    await prisma.$transaction((tx) =>
      addExp(tx, me.id, requiredExpOf(20), 'ADMIN', { type: 'ADMIN', id: 1 }),
    );
    const boxes = await prisma.memberItemBox.findMany({
      where: { userId: me.id },
      orderBy: { sourceRef: 'asc' },
    });
    expect(boxes.map((b) => b.sourceRef)).toEqual([3, 10, 20]);

    const rareCodes = (
      await prisma.item.findMany({
        where: { unlockType: 'P', rarity: 'R' },
        select: { code: true },
      })
    ).map((i) => i.code);
    await owns(me.id, rareCodes);
    const normal = await openItemBox(me.id, boxes[0].id, new Date(), () => 0.1);
    expect(normal.item?.rarity).toBe('N');

    const rest = (
      await prisma.item.findMany({
        where: { unlockType: 'P', memberItems: { none: { userId: me.id } } },
        select: { code: true },
      })
    ).map((i) => i.code);
    await owns(me.id, rest);
    const point = await api(me.id).post(`/characters/me/item-boxes/${boxes[1].id}/open`);
    expect(point.body.data).toMatchObject({ item: null, point: 100 });
    expect(point.body.message).toBe('먹포인트 100P를 받았어요!');
    expect(
      await prisma.pointHistory.findFirst({ where: { userId: me.id, reason: 'ITEM_BOX' } }),
    ).toMatchObject({ amount: 100, refType: 'ITEM_BOX', refId: boxes[1].id });
    expect(
      await prisma.memberItemBox.findUniqueOrThrow({ where: { id: boxes[1].id } }),
    ).toMatchObject({ status: 'O', resultItemId: null, resultPoint: 100 });
  });

  it('세트 배너 → 세트 구매(포인트 450, 두 아이템 지급·착용), 하나라도 가졌으면 409', async () => {
    const me = await createMember();
    await give(me.id, 1000);
    const shop = await api(me.id).get('/shop/items?category=HAT');
    expect(shop.body.data.sets).toEqual([
      expect.objectContaining({
        code: 'SET_STRAWBERRY',
        name: '딸기 모자 세트',
        price: 450,
        originalPrice: 550,
        badge: 'NEW',
        purchasable: true,
        canBuy: true,
      }),
    ]);
    expect(shop.body.data.items.find((i: { code: string }) => i.code === 'HAT_BEAR')).toMatchObject(
      { rarity: 'R', badge: 'HOT' },
    );
    const set = shop.body.data.sets[0];
    expect(set.items.map((i: { code: string }) => i.code)).toEqual([
      'HAT_STRAWBERRY',
      'PROP_HEART_BALLOON',
    ]);

    const bought = await api(me.id).post('/shop/set-purchases', {
      setId: set.setId,
      equipNow: true,
    });
    expect(bought.status).toBe(200);
    expect(bought.body.message).toBe('딸기 모자 세트를 샀어요!');
    expect(bought.body.data).toMatchObject({ pointBalance: 550, equipped: true });
    const mukkaebi = await prisma.mukkaebi.findUniqueOrThrow({ where: { userId: me.id } });
    expect(mukkaebi).toMatchObject({
      hatItemId: await itemId('HAT_STRAWBERRY'),
      propItemId: await itemId('PROP_HEART_BALLOON'),
    });
    expect(
      await prisma.pointHistory.findFirst({ where: { userId: me.id, reason: 'PURCHASE' } }),
    ).toMatchObject({ amount: -450, title: '딸기 모자 세트 구매', refType: 'ITEM_SET' });

    const again = await api(me.id).post('/shop/set-purchases', { setId: set.setId });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('SET_ITEM_OWNED');
    expect((await api(me.id).get('/shop/items?category=HAT')).body.data.sets[0]).toMatchObject({
      purchasable: false,
      canBuy: false,
    });
    expect((await api(me.id).post('/shop/set-purchases', { setId: 999 })).status).toBe(404);

    const poor = await createMember();
    const short = await api(poor.id).post('/shop/set-purchases', { setId: set.setId });
    expect(short.status).toBe(409);
    expect(short.body.code).toBe('POINT_NOT_ENOUGH');
  });

  it('명예 아이템은 업적 보상: 상점 명예 탭에 필요한 업적을 보여 주고, 업적을 달성하면 받는다', async () => {
    const me = await createMember();
    const honor = await api(me.id).get('/shop/items?category=HONOR');
    const codes = honor.body.data.items.map((i: { code: string }) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['HAT_CROWN', 'SKIN_NIGHTSKY', 'CLUB_GOLD']));
    expect(
      honor.body.data.items.find((i: { code: string }) => i.code === 'HAT_CROWN'),
    ).toMatchObject({
      rarity: 'H',
      purchasable: false,
      requiredAchievement: { name: '구의 먹짱' },
      unlockCondition: '구의 먹짱 업적을 달성하면 받아요.',
    });
  });
});
