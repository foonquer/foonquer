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

  it('사진 좌표·시각·키 검사, 같은 위치 확인 두 번, 오늘 이미 인증한 가게', async () => {
    const { me, restaurant, lat, lng } = await setup();
    const other = await createMember();
    const check = async () =>
      (
        await request(app)
          .post('/api/v1/visit-verifications/location-checks')
          .set('Authorization', bearer(me.id))
          .send({ restaurantId: Number(restaurant.id), lat, lng })
      ).body.data.verificationId as number;
    const onSite = (id: number, body: object) =>
      request(app)
        .post(`/api/v1/visit-verifications/${id}/on-site`)
        .set('Authorization', bearer(me.id))
        .send({ sitePhotoKey: `site/${me.id}/${randomUUID()}.jpg`, ...body });
    const id = await check();

    const halfCoord = await onSite(id, { photoLat: lat });
    expect(halfCoord.status).toBe(400);
    expect(halfCoord.body.code).toBe('INVALID_COORDINATE');
    // 한국 밖 좌표는 요청 오류가 아니라 사진 위치가 다른 것
    const abroad = await onSite(id, { photoLat: 48.85, photoLng: 2.35 });
    expect(abroad.status).toBe(422);
    expect(abroad.body.code).toBe('PHOTO_MISMATCH');
    const oldPhoto = await onSite(id, {
      photoTakenAt: new Date(Date.now() - 25 * 3600_000).toISOString(),
    });
    expect(oldPhoto.body.code).toBe('PHOTO_MISMATCH');
    const othersKey = await request(app)
      .post(`/api/v1/visit-verifications/${id}/on-site`)
      .set('Authorization', bearer(me.id))
      .send({ sitePhotoKey: `site/${other.id}/${randomUUID()}.jpg` });
    expect(othersKey.status).toBe(403);
    expect(othersKey.body.code).toBe('IMAGE_KEY_FORBIDDEN');
    expect(await prisma.pointHistory.count({ where: { userId: me.id } })).toBe(0);

    expect((await onSite(id, {})).status).toBe(200);
    const twice = await onSite(id, {});
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe('INVALID_VISIT_STATE');

    // 별점까지 남긴(C) 오늘은 같은 가게를 다시 인증할 수 없다
    await prisma.visit.update({ where: { id: BigInt(id) }, data: { status: 'C' } });
    const today = await request(app)
      .post('/api/v1/visit-verifications/location-checks')
      .set('Authorization', bearer(me.id))
      .send({ restaurantId: Number(restaurant.id), lat, lng });
    expect(today.status).toBe(409);
    expect(today.body.code).toBe('ALREADY_VERIFIED_TODAY');
  });

  it('같은 가게 위치 확인 두 건을 동시에 사진 인증해도 하나만 통과한다', async () => {
    const { me, restaurant, lat, lng } = await setup();
    const ids: number[] = [];
    for (let i = 0; i < 2; i += 1) {
      // 두 번째 위치 확인을 만들 수 있게 앞의 것은 아직 L 상태다
      const res = await request(app)
        .post('/api/v1/visit-verifications/location-checks')
        .set('Authorization', bearer(me.id))
        .send({ restaurantId: Number(restaurant.id), lat, lng });
      ids.push(res.body.data.verificationId as number);
    }
    const results = await Promise.all(
      ids.map((id) =>
        request(app)
          .post(`/api/v1/visit-verifications/${id}/on-site`)
          .set('Authorization', bearer(me.id))
          .send({ sitePhotoKey: `site/${me.id}/${randomUUID()}.jpg` }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await prisma.pointHistory.count({ where: { userId: me.id, reason: 'VISIT_VERIFIED' } }),
    ).toBe(1);
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

  const visitOf = (res: { body: { data: { verificationId: number } } }) =>
    prisma.visit.findUniqueOrThrow({ where: { id: BigInt(res.body.data.verificationId) } });

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

  it('가게에 사업자번호가 없으면 가게명으로 맞추고, 이름이 똑같을 때만 사업자번호를 저장한다', async () => {
    const { me } = await setup();
    const shop = await createRestaurant({ name: '스이루 중앙대점' });
    vi.mocked(readReceipt).mockResolvedValue(
      receipt({ storeName: '(주)스이루 중앙대점', businessNo: '9876543210', approvalNo: '3' }),
    );
    const res = await submit(me.id, shop.id);
    expect(await visitOf(res)).toMatchObject({ status: 'V' });
    expect((await prisma.restaurant.findUniqueOrThrow({ where: { id: shop.id } })).businessNo).toBe(
      '9876543210',
    );
  });

  it('이름이 포함 관계로만 맞으면(다른 지점일 수 있음) 인증은 되지만 사업자번호는 저장하지 않는다', async () => {
    const { me } = await setup();
    const shop = await createRestaurant({ name: '스이루 중앙대점' });
    vi.mocked(readReceipt).mockResolvedValue(
      receipt({ storeName: '스이루', businessNo: '1111111111', approvalNo: '4' }),
    );
    const res = await submit(me.id, shop.id);
    expect(await visitOf(res)).toMatchObject({ status: 'V' });
    expect(
      (await prisma.restaurant.findUniqueOrThrow({ where: { id: shop.id } })).businessNo,
    ).toBeNull();
  });

  it('같은 가게 영수증 두 장을 함께 내면 하나만 인증(+50P), 다른 하나는 ALREADY_VERIFIED', async () => {
    const { me, restaurant } = await setup();
    vi.mocked(readReceipt)
      .mockResolvedValueOnce(receipt({ approvalNo: '11' }))
      .mockResolvedValueOnce(receipt({ approvalNo: '22' }));
    const send = () =>
      request(app)
        .post('/api/v1/visit-verifications/receipt')
        .set('Authorization', bearer(me.id))
        .send({
          restaurantId: Number(restaurant.id),
          receiptImageKey: `receipt/${me.id}/${randomUUID()}.jpg`,
        });
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status]).toEqual([202, 202]);
    await flushReceiptChecks();
    const visits = await prisma.visit.findMany({
      where: { userId: me.id },
      orderBy: { id: 'asc' },
    });
    expect(visits.map((v) => v.status).sort()).toEqual(['F', 'V']);
    expect(visits.find((v) => v.status === 'F')?.failReason).toBe('ALREADY_VERIFIED');
    expect(
      await prisma.pointHistory.count({ where: { userId: me.id, reason: 'VISIT_VERIFIED' } }),
    ).toBe(1);
  });

  it('OCR 처리 중 예외가 나도 READING으로 남지 않고 UNREADABLE 실패가 되며 포인트는 없다', async () => {
    const { me, restaurant } = await setup();
    vi.mocked(readReceipt).mockRejectedValueOnce(new Error('OCR 서버 오류'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await submit(me.id, restaurant.id);
    errorLog.mockRestore();
    expect(await visitOf(res)).toMatchObject({ status: 'F', failReason: 'UNREADABLE' });
    expect(await prisma.pointHistory.count({ where: { userId: me.id } })).toBe(0);
  });
});

describe('VISIT-03·04·05 홈에서 바로 찍은 영수증', () => {
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
  const submitHome = async (userId: bigint) => {
    const res = await request(app)
      .post('/api/v1/visit-verifications/receipt')
      .set('Authorization', bearer(userId))
      .send({ receiptImageKey: `receipt/${userId}/${randomUUID()}.jpg` });
    await flushReceiptChecks();
    return res.body.data.verificationId as number;
  };
  const confirm = (userId: bigint, id: number, restaurantId: bigint) =>
    request(app)
      .post(`/api/v1/visit-verifications/${id}/restaurant`)
      .set('Authorization', bearer(userId))
      .send({ restaurantId: Number(restaurantId) });

  it('사업자번호로 후보를 찾아 "이 가게가 맞나요?"(R) → 가게를 고르면 인증(+50P)', async () => {
    const { me, restaurant, lat, lng } = await setup();
    vi.mocked(readReceipt).mockResolvedValue(receipt());
    const id = await submitHome(me.id);
    expect(await prisma.visit.findUniqueOrThrow({ where: { id: BigInt(id) } })).toMatchObject({
      status: 'R',
      restaurantId: null,
      ocrBusinessNo: '1234567890',
    });
    const check = await request(app)
      .get(`/api/v1/visit-verifications/${id}?lat=${lat}&lng=${lng}`)
      .set('Authorization', bearer(me.id));
    expect(check.body.data).toMatchObject({
      status: 'RESTAURANT_CHECK',
      restaurant: null,
      candidates: [{ restaurantId: Number(restaurant.id), matchedBy: 'BUSINESS_NO', distanceM: 0 }],
    });

    const other = await createRestaurant({ name: '다른집' });
    const wrong = await confirm(me.id, id, other.id);
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('RESTAURANT_NOT_CANDIDATE');

    const ok = await confirm(me.id, id, restaurant.id);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: 'VERIFIED', reward: { point: 50 } });
    expect(await prisma.visit.findUniqueOrThrow({ where: { id: BigInt(id) } })).toMatchObject({
      status: 'V',
      restaurantId: restaurant.id,
      businessNoMatched: true,
    });
    const again = await confirm(me.id, id, restaurant.id);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('INVALID_VISIT_STATE');
  });

  it('사업자번호가 없으면 가게명으로 후보를 찾고 가까운 순, 다른 사업자번호가 있는 지점은 뺀다', async () => {
    const { me } = await setup();
    const near = await createRestaurant({ name: '스이루 가양점' });
    const far = await createRestaurant({ name: '스이루 강남점', lat: 37.4979, lng: 127.0276 });
    await createRestaurant({ name: '스이루 홍대점', businessNo: '5555555555' });
    vi.mocked(readReceipt).mockResolvedValue(
      receipt({ storeName: '스이루', businessNo: '9999999999' }),
    );
    const id = await submitHome(me.id);
    const check = await request(app)
      .get(
        `/api/v1/visit-verifications/${id}?lat=${near.lat.toNumber()}&lng=${near.lng.toNumber()}`,
      )
      .set('Authorization', bearer(me.id));
    expect(
      (check.body.data.candidates as { restaurantId: number }[]).map((c) => c.restaurantId),
    ).toEqual([Number(near.id), Number(far.id)]);
  });

  it('맞는 가게가 하나도 없으면 STORE_NOT_FOUND 실패', async () => {
    const { me } = await setup();
    vi.mocked(readReceipt).mockResolvedValue(
      receipt({ storeName: '세상에없는집', businessNo: null }),
    );
    const id = await submitHome(me.id);
    const res = await request(app)
      .get(`/api/v1/visit-verifications/${id}`)
      .set('Authorization', bearer(me.id));
    expect(res.body.data).toMatchObject({ status: 'FAILED', failReason: 'STORE_NOT_FOUND' });
    expect(res.body.data.failMessage).toContain('가게를 찾지 못했어요');
  });
});
