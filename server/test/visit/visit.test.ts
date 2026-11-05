import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { readReceipt } from '../../src/modules/visit/receipt-ocr';
import { flushReceiptChecks } from '../../src/modules/visit/visit.service';
import { resetDb } from '../helpers/db';
import { bearer, createActiveSeason, createMember, createRestaurant } from '../helpers/fixtures';
import * as storage from '../../src/lib/storage';
import { resetStorageMock } from '../helpers/storage-mock';

vi.mock('../../src/lib/storage', async () =>
  (await import('../helpers/storage-mock.js')).storageMock(),
);
vi.mock('../../src/modules/visit/receipt-ocr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/modules/visit/receipt-ocr')>()),
  readReceipt: vi.fn(),
}));

const app = createApp();

beforeEach(async () => {
  await resetDb();
  resetStorageMock(storage);
});

afterEach(async () => {
  await flushReceiptChecks();
  vi.clearAllMocks();
});

/** 가게 좌표에서 북쪽으로 dM 미터 떨어진 점 */
function north(lat: number, dM: number) {
  return lat + dM / 111_195;
}

async function setup() {
  const season = await createActiveSeason(3);
  const me = await createMember();
  const restaurant = await createRestaurant({ name: '옛날손칼국수', businessNo: '1234567890' });
  await prisma.memberLocalRegion.create({
    data: {
      userId: me.id,
      regionId: restaurant.regionId,
      sigunguId: restaurant.sigunguId,
      sortOrder: 0,
    },
  });
  return { season, me, restaurant, lat: restaurant.lat.toNumber(), lng: restaurant.lng.toNumber() };
}

describe('VISIT-01·02 현장 인증', () => {
  it('100m 안이면 위치 확인 → 음식 사진으로 인증 완료(V), 방문 인증 +50P·로컬·시즌을 채운다', async () => {
    const { season, me, restaurant, lat, lng } = await setup();
    const check = await request(app)
      .post('/api/v1/visit-verifications/location-checks')
      .set('Authorization', bearer(me.id))
      .send({ restaurantId: Number(restaurant.id), lat: north(lat, 42), lng, accuracyM: 15 });
    expect(check.status).toBe(201);
    expect(check.body.data).toMatchObject({ distanceM: 42, allowedM: 100 });
    const id = check.body.data.verificationId as number;

    const photo = await request(app)
      .post(`/api/v1/visit-verifications/${id}/on-site`)
      .set('Authorization', bearer(me.id))
      .send({
        sitePhotoKey: `site/${me.id}/${randomUUID()}.jpg`,
        photoTakenAt: new Date().toISOString(),
      });
    expect(photo.status).toBe(200);
    expect(photo.body.data).toMatchObject({ status: 'VERIFIED', reward: { point: 50 } });

    const visit = await prisma.visit.findUniqueOrThrow({ where: { id: BigInt(id) } });
    expect(visit).toMatchObject({ status: 'V', seasonId: season.id, isLocal: true });
    const stat = await prisma.restaurantStat.findUniqueOrThrow({
      where: { restaurantId: restaurant.id },
    });
    expect(stat).toMatchObject({ visitCount: 1, localVisitCount: 1, visitorCount: 1 });

    const result = await request(app)
      .get(`/api/v1/visit-verifications/${id}`)
      .set('Authorization', bearer(me.id));
    expect(result.body.data).toMatchObject({
      method: 'ON_SITE',
      status: 'VERIFIED',
      canRate: true,
    });
    expect(result.body.data.sitePhotoUrl).toMatch(/^https:\/\/signed\.test\/site\//);

    // 별점을 남기기 전에는 같은 가게를 다시 인증할 수 없다
    const again = await request(app)
      .post('/api/v1/visit-verifications/location-checks')
      .set('Authorization', bearer(me.id))
      .send({ restaurantId: Number(restaurant.id), lat, lng });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('VISIT_PENDING_RATING');
    expect(again.body.data.verificationId).toBe(id);
  });

  it('100m 밖이면 422 VISIT_TOO_FAR, 사진 위치가 300m 넘게 다르면 422 PHOTO_MISMATCH, 10분 지나면 409', async () => {
    const { me, restaurant, lat, lng } = await setup();
    const far = await request(app)
      .post('/api/v1/visit-verifications/location-checks')
      .set('Authorization', bearer(me.id))
      .send({ restaurantId: Number(restaurant.id), lat: north(lat, 250), lng });
    expect(far.status).toBe(422);
    expect(far.body).toMatchObject({
      code: 'VISIT_TOO_FAR',
      data: { distanceM: 250, allowedM: 100 },
    });

    const check = await request(app)
      .post('/api/v1/visit-verifications/location-checks')
      .set('Authorization', bearer(me.id))
      .send({ restaurantId: Number(restaurant.id), lat, lng });
    const id = check.body.data.verificationId as number;
    const mismatch = await request(app)
      .post(`/api/v1/visit-verifications/${id}/on-site`)
      .set('Authorization', bearer(me.id))
      .send({
        sitePhotoKey: `site/${me.id}/${randomUUID()}.jpg`,
        photoLat: north(lat, 1000),
        photoLng: lng,
      });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.code).toBe('PHOTO_MISMATCH');

    await prisma.visit.update({
      where: { id: BigInt(id) },
      data: { checkinAt: new Date(Date.now() - 11 * 60_000) },
    });
    const expired = await request(app)
      .post(`/api/v1/visit-verifications/${id}/on-site`)
      .set('Authorization', bearer(me.id))
      .send({ sitePhotoKey: `site/${me.id}/${randomUUID()}.jpg` });
    expect(expired.status).toBe(409);
    expect(expired.body.code).toBe('LOCATION_CHECK_EXPIRED');
  });

  it('다른 회원의 인증은 404', async () => {
    const { me, restaurant, lat, lng } = await setup();
    const other = await createMember();
    const check = await request(app)
      .post('/api/v1/visit-verifications/location-checks')
      .set('Authorization', bearer(me.id))
      .send({ restaurantId: Number(restaurant.id), lat, lng });
    const res = await request(app)
      .get(`/api/v1/visit-verifications/${check.body.data.verificationId}`)
      .set('Authorization', bearer(other.id));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('VISIT_NOT_FOUND');
  });
});

describe('VISIT-03·04 영수증 인증', () => {
  const receipt = (over: Partial<Awaited<ReturnType<typeof readReceipt>> & object> = {}) => ({
    storeName: '옛날손칼국수 가양점',
    businessNo: '1234567890',
    paidAt: new Date(Date.now() - 2 * 3600_000),
    totalAmount: 18000,
    approvalNo: '12345678',
    items: [{ menuName: '칼국수', quantity: 2, price: 18000 }],
    raw: { ok: true },
    ...over,
  });

  async function submit(userId: bigint, restaurantId: bigint) {
    const res = await request(app)
      .post('/api/v1/visit-verifications/receipt')
      .set('Authorization', bearer(userId))
      .send({
        restaurantId: Number(restaurantId),
        receiptImageKey: `receipt/${userId}/${randomUUID()}.jpg`,
      });
    await flushReceiptChecks();
    return res;
  }

  it('접수 202 → OCR 결과가 맞으면 인증 완료, 메뉴 줄을 남긴다', async () => {
    const { me, restaurant } = await setup();
    vi.mocked(readReceipt).mockResolvedValue(receipt());
    const res = await submit(me.id, restaurant.id);
    expect(res.status).toBe(202);
    expect(res.body.data.status).toBe('READING');

    const result = await request(app)
      .get(`/api/v1/visit-verifications/${res.body.data.verificationId}`)
      .set('Authorization', bearer(me.id));
    expect(result.body.data).toMatchObject({
      method: 'RECEIPT',
      status: 'VERIFIED',
      receipt: {
        storeName: '옛날손칼국수 가양점',
        totalAmount: 18000,
        businessNoMatched: true,
        items: [{ menuName: '칼국수', quantity: 2 }],
      },
    });
    expect(readReceipt).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/signed\.test\/receipt\//),
      'jpg',
    );
  });

  it('같은 영수증은 DUPLICATE, 7일 지나면 EXPIRED, 가게가 다르면 STORE_MISMATCH, 못 읽으면 UNREADABLE', async () => {
    const { me, restaurant } = await setup();
    const friend = await createMember();
    vi.mocked(readReceipt).mockResolvedValue(receipt());
    await submit(me.id, restaurant.id);
    const dup = await submit(friend.id, restaurant.id);
    const dupVisit = await prisma.visit.findUniqueOrThrow({
      where: { id: BigInt(dup.body.data.verificationId) },
    });
    expect(dupVisit).toMatchObject({ status: 'F', failReason: 'DUPLICATE' });

    const other = await createRestaurant({ name: '다른집' });
    vi.mocked(readReceipt).mockResolvedValue(
      receipt({ paidAt: new Date(Date.now() - 8 * 86_400_000), approvalNo: '1' }),
    );
    const old = await submit(friend.id, other.id);
    expect(
      (
        await prisma.visit.findUniqueOrThrow({
          where: { id: BigInt(old.body.data.verificationId) },
        })
      ).failReason,
    ).toBe('EXPIRED');

    vi.mocked(readReceipt).mockResolvedValue(receipt({ businessNo: null, approvalNo: '2' }));
    const mismatch = await submit(friend.id, other.id);
    const failed = await request(app)
      .get(`/api/v1/visit-verifications/${mismatch.body.data.verificationId}`)
      .set('Authorization', bearer(friend.id));
    expect(failed.body.data).toMatchObject({ status: 'FAILED', failReason: 'STORE_MISMATCH' });
    expect(failed.body.data.failMessage).toContain('가게 정보가 달라요');

    vi.mocked(readReceipt).mockResolvedValue(null);
    const unreadable = await submit(friend.id, other.id);
    expect(
      (
        await prisma.visit.findUniqueOrThrow({
          where: { id: BigInt(unreadable.body.data.verificationId) },
        })
      ).failReason,
    ).toBe('UNREADABLE');
  });

  it('가게에 사업자번호가 없으면 가게명으로 맞추고, 맞으면 사업자번호를 저장한다', async () => {
    const { me } = await setup();
    const shop = await createRestaurant({ name: '스이루 중앙대점' });
    vi.mocked(readReceipt).mockResolvedValue(
      receipt({ storeName: '스이루', businessNo: '9876543210', approvalNo: '3' }),
    );
    await submit(me.id, shop.id);
    expect((await prisma.restaurant.findUniqueOrThrow({ where: { id: shop.id } })).businessNo).toBe(
      '9876543210',
    );
  });
});
