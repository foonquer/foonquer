import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { addPoint } from '../../src/modules/reward/reward.service';
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
    expect(
      (await api(me.id).post('/shop/purchases', { itemId: strawberry.itemId })).body.code,
    ).toBe('ITEM_ALREADY_OWNED');

    const acorn = await itemId('HAT_ACORN');
    const poor = await api(me.id).post('/shop/purchases', { itemId: acorn });
    expect(poor.body).toMatchObject({ code: 'POINT_NOT_ENOUGH', data: { shortage: 400 } });
    expect(
      (await api(me.id).post('/shop/purchases', { itemId: await itemId('HAT_CROWN') })).body.code,
    ).toBe('ITEM_NOT_FOR_SALE');

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
    expect(
      (await api(me.id).put('/characters/me/appearance', { propItemId: await itemId('PROP_MIC') }))
        .body.code,
    ).toBe('ITEM_NOT_OWNED');
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
    const types = (list.body.data.items as { type: string }[]).map((i) => i.type).sort();
    expect(types).toEqual(['ACHIEVEMENT', 'LEVEL_UP', 'TIER_UP']);
    for (const item of list.body.data.items as { celebrationId: string }[]) {
      const seen = await api(me.id).patch(`/users/me/celebrations/${item.celebrationId}/seen`);
      expect(seen.status).toBe(200);
    }
    expect((await api(me.id).get('/users/me/celebrations')).body.data.items).toHaveLength(0);
    expect((await api(me.id).patch('/users/me/celebrations/ACHIEVEMENT:999/seen')).body.code).toBe(
      'CELEBRATION_NOT_FOUND',
    );
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
    await prisma.memberItem.update({
      where: { userId_itemId: { userId: me.id, itemId: gold } },
      data: { quantity: 3 },
    });
    const made = await api(me.id).post(`/characters/me/items/${legend}/craft`);
    expect(made.body.data).toMatchObject({
      item: { code: 'CLUB_LEGEND', quantity: 1 },
      material: { quantity: 0 },
    });
    expect((await api(me.id).post(`/characters/me/items/${gold}/craft`)).body.code).toBe(
      'RECIPE_NOT_FOUND',
    );
  });
});
