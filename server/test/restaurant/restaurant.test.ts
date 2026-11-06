import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { toKstIso } from '../../src/common/time';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from '../helpers/db';
import {
  agreeConsents,
  bearer,
  createActiveSeason,
  createConquest,
  createMember,
  createPastSeason,
  createRestaurant,
  createVisit,
} from '../helpers/fixtures';

const app = createApp();

const HOURS = {
  mon: [{ open: '11:00', close: '21:00' }],
  tue: [{ open: '11:00', close: '21:00' }],
  wed: [
    { open: '11:00', close: '15:00' },
    { open: '17:00', close: '22:00' },
  ],
  thu: [{ open: '11:00', close: '21:00' }],
  fri: [{ open: '11:00', close: '21:00' }],
  sat: [{ open: '11:00', close: '21:00' }],
  sun: [],
};

/** 리뷰 4개(세부 평가 3개), 방문 10번(로컬 7번), 방문자 8명(재방문 3명) */
async function giveStats(restaurantId: bigint) {
  await prisma.restaurantStat.create({
    data: {
      restaurantId,
      reviewCount: 4,
      textReviewCount: 3,
      photoReviewCount: 1,
      scoreSum: 17,
      weightSum: 3.5,
      weightedScoreSum: 14.7,
      displayScore: 4.2,
      tasteSum: 18,
      cleanlinessSum: 13,
      portionSum: 12,
      serviceSum: 14,
      priceSum: 11,
      detailReviewCount: 3,
      revisitIntentCount: 2,
      visitCount: 10,
      localVisitCount: 7,
      visitorCount: 8,
      revisitorCount: 3,
    },
  });
}

async function preview(userId: bigint, id: bigint | string, query: Record<string, string> = {}) {
  return request(app)
    .get(`/api/v1/restaurants/${id}/preview`)
    .query(query)
    .set('Authorization', bearer(userId));
}

async function detail(userId: bigint, id: bigint | string, query: Record<string, string> = {}) {
  return request(app)
    .get(`/api/v1/restaurants/${id}`)
    .query(query)
    .set('Authorization', bearer(userId));
}

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MAP-02 GET /restaurants/{restaurantId}/preview', () => {
  it('미정복 가게: 기본 정보·별점·이번 시즌 정복자 수를 준다', async () => {
    const season = await createActiveSeason();
    const me = await createMember();
    const r = await createRestaurant({
      name: '이가네떡볶이',
      categoryId: 5,
      lat: 37.5664,
      lng: 126.8447,
      businessHours: HOURS,
    });
    await giveStats(r.id);
    for (let i = 0; i < 2; i += 1) {
      await createConquest((await createMember()).id, r, season.id);
    }

    // 2026-10-28(수) 13:00 KST
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T04:00:00Z'));
    const res = await preview(me.id, r.id, { lat: '37.5613', lng: '126.8545' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('가게 미리보기를 조회했어요.');
    expect(res.body.data).toEqual({
      restaurantId: Number(r.id),
      name: '이가네떡볶이',
      categoryId: 5,
      categoryName: '분식',
      sigunguName: '강서구',
      dongName: '가양동',
      distanceM: expect.any(Number),
      rating: { score: 4.2, reviewCount: 4 },
      hasMapae: false,
      businessStatus: { isOpen: true, todayOpenTime: '11:00', todayCloseTime: '22:00' },
      currentSeasonConquerorCount: 2,
      conquestState: 'NOT_CONQUERED',
      conqueredInPastSeason: false,
      isSaved: false,
      myConquest: null,
      moving: null,
    });
    // 37.5664,126.8447 ↔ 37.5613,126.8545 ≈ 1.04km
    expect(res.body.data.distanceM).toBeGreaterThan(1000);
    expect(res.body.data.distanceM).toBeLessThan(1100);
  });

  it('정복 완료: 내 리뷰 점수·재방문 의사·글 리뷰 여부를 준다', async () => {
    const season = await createActiveSeason();
    const past = await createPastSeason();
    const me = await createMember();
    const r = await createRestaurant();
    const conqueredAt = new Date('2026-10-20T10:20:00Z');
    const { visit } = await createConquest(me.id, r, season.id, conqueredAt);
    await createConquest(me.id, r, past.id);
    const review = await prisma.review.create({
      data: {
        visitId: visit.id,
        userId: me.id,
        restaurantId: r.id,
        taste: 5,
        scoreAvg: 4.8,
        revisitIntent: true,
        content: '맛있어요',
      },
    });
    await prisma.savedRestaurant.create({ data: { userId: me.id, restaurantId: r.id } });

    const res = await preview(me.id, r.id);
    expect(res.body.data).toMatchObject({
      distanceM: null,
      rating: { score: null, reviewCount: 0 },
      businessStatus: null,
      currentSeasonConquerorCount: 1,
      conquestState: 'CONQUERED',
      conqueredInPastSeason: true,
      isSaved: true,
      myConquest: {
        conqueredAt: toKstIso(conqueredAt),
        myScore: 4.8,
        revisitIntent: true,
        hasTextReview: true,
        reviewId: Number(review.id),
      },
      moving: null,
    });
  });

  it('먹깨비 이동 중: 별점 대기 중인 방문을 준다', async () => {
    await createActiveSeason();
    const me = await createMember();
    const r = await createRestaurant();
    const verifiedAt = new Date('2026-10-28T03:58:00Z');
    const visit = await createVisit(me.id, r.id, { status: 'V', verifiedAt });
    await createVisit(me.id, r.id, { status: 'F', verifiedAt: null });

    const res = await preview(me.id, r.id);
    expect(res.body.data).toMatchObject({
      conquestState: 'MOVING',
      myConquest: null,
      moving: { visitId: Number(visit.id), verifiedAt: toKstIso(verifiedAt) },
    });
  });

  it('폐업 가게는 보여 주고, 숨김·없는 가게는 404 RESTAURANT_NOT_FOUND', async () => {
    const me = await createMember();
    const closed = await createRestaurant({ status: 'C' });
    const hidden = await createRestaurant({ status: 'H' });
    expect((await preview(me.id, closed.id)).status).toBe(200);

    for (const id of [hidden.id, 999999n]) {
      const res = await preview(me.id, id);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('RESTAURANT_NOT_FOUND');
      expect(res.body.message).toBe('가게를 찾을 수 없어요.');
    }
  });

  it.each([[{ lat: '37.56' }], [{ lng: '126.85' }], [{ lat: 'abc', lng: '126.85' }]])(
    '위치가 잘못되면 400 INVALID_COORDINATE %j',
    async (query) => {
      const me = await createMember();
      const r = await createRestaurant();
      const res = await preview(me.id, r.id, query);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_COORDINATE');
    },
  );

  it('프로필 설정 전이면 403 PROFILE_REQUIRED', async () => {
    const me = await createMember({ status: 'P', nickname: null });
    await agreeConsents(me.id);
    const r = await createRestaurant();
    const res = await preview(me.id, r.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PROFILE_REQUIRED');
  });
});

describe('REST-01 GET /restaurants/{restaurantId}', () => {
  it('기본 정보·영업시간·별점·항목별 평균·비율을 준다', async () => {
    await createActiveSeason();
    const me = await createMember();
    const r = await createRestaurant({
      kakaoPlaceId: '1234567890',
      name: '새맛집',
      kakaoCategoryName: '음식점 > 한식 > 한정식',
      phone: '02-1234-5678',
      roadAddress: '서울 강서구 가양로 123',
      jibunAddress: '서울 강서구 가양동 1487',
      lat: 37.5627,
      lng: 126.8572,
      businessHours: { ...HOURS, sun: undefined },
    });
    await giveStats(r.id);

    // 2026-10-25(일) 12:00 KST — 일요일은 휴무
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T03:00:00Z'));
    const res = await detail(me.id, r.id, { lat: '37.5627', lng: '126.8572' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('음식점 상세를 조회했어요.');
    expect(res.body.data).toEqual({
      restaurantId: Number(r.id),
      kakaoPlaceId: '1234567890',
      name: '새맛집',
      status: 'A',
      categoryId: 1,
      categoryName: '한식',
      kakaoCategoryName: '음식점 > 한식 > 한정식',
      phone: '02-1234-5678',
      roadAddress: '서울 강서구 가양로 123',
      jibunAddress: '서울 강서구 가양동 1487',
      sigunguName: '강서구',
      dongName: '가양동',
      lat: 37.5627,
      lng: 126.8572,
      distanceM: 0,
      kakaoPlaceUrl: 'https://place.map.kakao.com/1234567890',
      businessHours: { ...HOURS, sun: [] },
      businessStatus: { isOpen: false, todayOpenTime: null, todayCloseTime: null },
      rating: { score: 4.2, reviewCount: 4 },
      hasMapae: false,
      stats: {
        taste: 4.5,
        cleanliness: 4.3,
        portion: 4,
        service: 4.7,
        price: 3.7,
        revisitIntentRate: 67,
        localVisitRate: 70,
        revisitRate: 38,
        textReviewCount: 3,
        photoReviewCount: 1,
        visitCount: 10,
        currentSeasonConquerorCount: 0,
      },
      my: {
        conquestState: 'NOT_CONQUERED',
        conqueredInPastSeason: false,
        conqueredAt: null,
        myScore: null,
        myReviewId: null,
        movingVisitId: null,
        isSaved: false,
      },
    });
  });

  it('마패가 붙은 가게는 hasMapae true', async () => {
    const me = await createMember();
    const r = await createRestaurant({ hasMapae: true });
    const res = await detail(me.id, r.id);
    expect(res.body.data.hasMapae).toBe(true);
  });

  it('리뷰는 있지만 신뢰도 가중 별점을 아직 계산하지 않았으면 score null', async () => {
    const me = await createMember();
    const r = await createRestaurant();
    await prisma.restaurantStat.create({ data: { restaurantId: r.id, reviewCount: 3 } });
    const res = await detail(me.id, r.id);
    expect(res.body.data.rating).toEqual({ score: null, reviewCount: 3 });
  });

  it('통계가 아직 없는 가게는 평균·비율이 null, 개수는 0', async () => {
    const me = await createMember();
    const r = await createRestaurant({ businessHours: { mon: 'wrong' } });
    const res = await detail(me.id, r.id);
    expect(res.body.data).toMatchObject({
      distanceM: null,
      businessHours: null,
      businessStatus: null,
      rating: { score: null, reviewCount: 0 },
      stats: {
        taste: null,
        cleanliness: null,
        portion: null,
        service: null,
        price: null,
        revisitIntentRate: null,
        localVisitRate: null,
        revisitRate: null,
        textReviewCount: 0,
        photoReviewCount: 0,
        visitCount: 0,
        currentSeasonConquerorCount: 0,
      },
    });
  });

  it('정복 완료면 정복 시각·내 점수·내 리뷰 id, 이동 중이면 방문 id', async () => {
    const season = await createActiveSeason();
    const me = await createMember();
    const conqueredRestaurant = await createRestaurant();
    const { visit, conquest } = await createConquest(me.id, conqueredRestaurant, season.id);
    const review = await prisma.review.create({
      data: {
        visitId: visit.id,
        userId: me.id,
        restaurantId: conqueredRestaurant.id,
        taste: 4,
        scoreAvg: 4.4,
      },
    });
    const conqueredRes = await detail(me.id, conqueredRestaurant.id);
    expect(conqueredRes.body.data.my).toEqual({
      conquestState: 'CONQUERED',
      conqueredInPastSeason: false,
      conqueredAt: toKstIso(conquest.conqueredAt),
      myScore: 4.4,
      myReviewId: Number(review.id),
      movingVisitId: null,
      isSaved: false,
    });
    expect(conqueredRes.body.data.stats.currentSeasonConquerorCount).toBe(1);

    const movingRestaurant = await createRestaurant();
    const moving = await createVisit(me.id, movingRestaurant.id, { status: 'V' });
    const movingRes = await detail(me.id, movingRestaurant.id);
    expect(movingRes.body.data.my).toMatchObject({
      conquestState: 'MOVING',
      conqueredAt: null,
      myScore: null,
      movingVisitId: Number(moving.id),
    });
  });

  it('폐업 가게도 상세는 보여 주고(status C), 숨김은 404', async () => {
    const me = await createMember();
    const closed = await createRestaurant({ status: 'C' });
    const res = await detail(me.id, closed.id);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('C');

    const hidden = await createRestaurant({ status: 'H' });
    expect((await detail(me.id, hidden.id)).body.code).toBe('RESTAURANT_NOT_FOUND');
  });

  it('id가 숫자가 아니면 400 VALIDATION_ERROR', async () => {
    const me = await createMember();
    const res = await detail(me.id, 'abc');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
