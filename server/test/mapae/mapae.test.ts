import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import * as storage from '../../src/lib/storage';
import { resetDb } from '../helpers/db';
import { bearer, createMember, createRestaurant } from '../helpers/fixtures';
import { resetStorageMock } from '../helpers/storage-mock';

vi.mock('../../src/lib/storage', async () =>
  (await import('../helpers/storage-mock.js')).storageMock(),
);

const app = createApp();
const SHOP = { lat: 37.5617, lng: 126.8545 };

beforeEach(async () => {
  await resetDb();
  resetStorageMock(storage);
});

afterEach(() => {
  vi.clearAllMocks();
});

const report = (userId: bigint, restaurantId: bigint, patch: Record<string, unknown> = {}) =>
  request(app)
    .post(`/api/v1/restaurants/${restaurantId}/mapae-reports`)
    .set('Authorization', bearer(userId))
    .send({
      eventType: 'STAR5',
      photoKey: `mapae/${userId}/${randomUUID()}.jpg`,
      lat: SHOP.lat + 0.0002, // 약 22m
      lng: SHOP.lng,
      ...patch,
    });

describe('마패 제보 (MAPAE-01·02)', () => {
  it('가게 근처에서 서로 다른 방문자 2명이 제보하면 마패가 붙고 두 사람 모두 +50P', async () => {
    const shop = await createRestaurant({ name: '이벤트식당', ...SHOP });
    const first = await createMember();
    const second = await createMember();

    const one = await report(first.id, shop.id, { memo: '별점 5점 주면 음료 서비스' });
    expect(one.status).toBe(201);
    expect(one.body.data).toMatchObject({
      restaurantName: '이벤트식당',
      eventType: 'STAR5',
      status: 'PENDING',
      hasVisit: false,
      reporterCount: 1,
      reportersNeeded: 2,
      rewardPoint: 0,
    });
    expect(one.body.data.distanceM).toBeLessThan(30);

    // 같은 사람이 또 제보하면 한 번으로 친다
    const again = await report(first.id, shop.id);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('MAPAE_REPORT_DUPLICATE');

    const two = await report(second.id, shop.id, { eventType: 'SERVICE' });
    expect(two.status).toBe(201);
    expect(two.body.data).toMatchObject({ status: 'CONFIRMED', reporterCount: 2, rewardPoint: 50 });

    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: shop.id } });
    expect(restaurant.hasMapae).toBe(true);
    const mapae = await prisma.restaurantMapae.findFirstOrThrow({
      where: { restaurantId: shop.id },
    });
    expect(mapae).toMatchObject({ reason: 'E', status: 'A', grantedBy: 'auto:report' });
    for (const m of [first, second]) {
      const member = await prisma.member.findUniqueOrThrow({ where: { id: m.id } });
      expect(member.pointBalance).toBe(50);
    }
    // 먼저 제보한 사람에게는 알림
    const notified = await prisma.notification.findMany({ where: { userId: first.id } });
    expect(notified.map((n) => n.title)).toEqual(['제보한 가게에 마패가 붙었어요']);

    // 먼저 제보한 사람의 접수 현황도 확정으로 바뀐다
    const status = await request(app)
      .get(`/api/v1/mapae-reports/${one.body.data.reportId}`)
      .set('Authorization', bearer(first.id));
    expect(status.body.data).toMatchObject({
      status: 'CONFIRMED',
      reporterCount: 2,
      rewardPoint: 50,
    });
    // 남의 제보는 볼 수 없다
    const others = await request(app)
      .get(`/api/v1/mapae-reports/${one.body.data.reportId}`)
      .set('Authorization', bearer(second.id));
    expect(others.status).toBe(404);

    // 상세: 방문자 제보 2건으로 붙은 마패
    const detail = await request(app)
      .get(`/api/v1/restaurants/${shop.id}`)
      .set('Authorization', bearer(first.id));
    expect(detail.body.data).toMatchObject({ hasMapae: true, mapaeReportCount: 2 });

    // 이미 마패가 붙은 가게는 더 받지 않는다
    const third = await report((await createMember()).id, shop.id);
    expect(third.status).toBe(409);
    expect(third.body.code).toBe('MAPAE_ALREADY_SHOWN');
  });

  it('가게에서 멀거나(100m 밖) 30일이 지난 제보는 모으지 않는다', async () => {
    const shop = await createRestaurant(SHOP);
    const far = await report((await createMember()).id, shop.id, { lat: SHOP.lat + 0.002 });
    expect(far.status).toBe(400);
    expect(far.body.code).toBe('MAPAE_REPORT_TOO_FAR');
    expect(far.body.data).toMatchObject({ allowedM: 100 });

    const old = await createMember();
    await prisma.mapaeReport.create({
      data: {
        restaurantId: shop.id,
        userId: old.id,
        eventType: 'ETC',
        photoKey: `mapae/${old.id}/${randomUUID()}.jpg`,
        lat: SHOP.lat,
        lng: SHOP.lng,
        distanceM: 0,
        hasVisit: false,
        regDate: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      },
    });
    const now = await report((await createMember()).id, shop.id);
    expect(now.body.data).toMatchObject({ status: 'PENDING', reporterCount: 1 });

    const badType = await report((await createMember()).id, shop.id, { eventType: 'BRIBE' });
    expect(badType.body.code).toBe('INVALID_MAPAE_EVENT_TYPE');
    const notMine = await report((await createMember()).id, shop.id, {
      photoKey: `mapae/${old.id}/${randomUUID()}.jpg`,
    });
    expect(notMine.body.code).toBe('IMAGE_KEY_FORBIDDEN');
  });
});

describe('사장님 이의제기 (MAPAE-03)', () => {
  it('마패가 붙은 가게만, 1:1 문의(MAPAE)로 접수되고 문의 내역에 가게·관계·사유가 보인다', async () => {
    const owner = await createMember();
    const plain = await createRestaurant({ name: '평범식당' });
    const send = (restaurantId: bigint, patch: Record<string, unknown> = {}) =>
      request(app)
        .post(`/api/v1/restaurants/${restaurantId}/mapae-objections`)
        .set('Authorization', bearer(owner.id))
        .send({
          relation: 'OWNER',
          reason: 'ENDED',
          content: '11월 10일에 이벤트를 끝내고 안내문을 뗐어요.',
          ...patch,
        });

    const notShown = await send(plain.id);
    expect(notShown.status).toBe(409);
    expect(notShown.body.code).toBe('MAPAE_NOT_SHOWN');

    const shop = await createRestaurant({ name: '이벤트식당', hasMapae: true });
    expect((await send(shop.id, { relation: 'FRIEND' })).body.code).toBe('INVALID_OWNER_RELATION');
    expect((await send(shop.id, { reason: 'ANGRY' })).body.code).toBe('INVALID_OBJECTION_REASON');
    expect((await send(shop.id, { content: '  ' })).body.code).toBe('OBJECTION_CONTENT_REQUIRED');

    const key = `inquiry/${owner.id}/${randomUUID()}.jpg`;
    const created = await send(shop.id, { relation: 'MANAGER', imageKey: key });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('WAITING');

    const objection = {
      restaurant: { restaurantId: Number(shop.id), name: '이벤트식당' },
      relation: 'MANAGER',
      reason: 'ENDED',
    };
    const detail = await request(app)
      .get(`/api/v1/inquiries/${created.body.data.inquiryId}`)
      .set('Authorization', bearer(owner.id));
    expect(detail.body.data).toMatchObject({
      category: 'MAPAE',
      content: '11월 10일에 이벤트를 끝내고 안내문을 뗐어요.',
      imageUrl: `https://signed.test/${key}`,
      mapaeObjection: objection,
      status: 'WAITING',
    });
    const mine = await request(app)
      .get('/api/v1/inquiries/me')
      .set('Authorization', bearer(owner.id));
    expect(mine.body.data.items[0]).toMatchObject({ category: 'MAPAE', mapaeObjection: objection });

    // 운영자: 문의 목록에서 이의제기한 가게의 표시 중인 마패를 보고 바로 해제한다
    const admin = await createMember({ role: 'A' });
    const mapae = await prisma.restaurantMapae.create({
      data: { restaurantId: shop.id, reason: 'E', grantedBy: 'auto:report', grantedAt: new Date() },
    });
    const list = await request(app)
      .get('/api/v1/admin/inquiries')
      .set('Authorization', bearer(admin.id));
    expect(list.body.data.items[0]).toMatchObject({
      category: 'MAPAE',
      mapaeObjection: objection,
      activeMapaeId: Number(mapae.id),
    });
    const released = await request(app)
      .patch(`/api/v1/admin/mapae/${mapae.id}/release`)
      .set('Authorization', bearer(admin.id))
      .send({ releaseReason: '사장님 이의제기: 이벤트 종료 확인' });
    expect(released.status).toBe(200);
    const after = await prisma.restaurant.findUniqueOrThrow({ where: { id: shop.id } });
    expect(after.hasMapae).toBe(false);
  });
});
