import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { toKstIso } from '../../src/common/time';
import { prisma } from '../../src/lib/prisma';
import { refreshRestaurantStat } from '../../src/modules/restaurant/restaurant-stat-calc';
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
import { kakaoCalls, kakaoPlace, stubKakao } from '../helpers/kakao';

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

/** 리뷰 5개(세부 평가 3개), 방문 10번(로컬 7번), 방문자 8명(재방문 3명) */
async function giveStats(restaurantId: bigint) {
  await prisma.restaurantStat.create({
    data: {
      restaurantId,
      reviewCount: 5,
      textReviewCount: 3,
      photoReviewCount: 1,
      scoreSum: 17,
      weightSum: 3.5,
      weightedScoreSum: 14.7,
      displayScore: 4.2,
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
      imageUrl: null,
      sigunguName: '강서구',
      dongName: '가양동',
      distanceM: expect.any(Number),
      rating: { score: 4.2, reviewCount: 5 },
      // 취향을 안 골랐으면 다섯 항목 같은 비중: (4.2 + 4.3 + 4.0 + 4.7 + 3.7) ÷ 5 = 4.18
      myOverallScore: 4.2,
      hasMapae: false,
      businessStatus: { isOpen: true, todayOpenTime: '11:00', todayCloseTime: '22:00' },
      currentSeasonConquerorCount: 2,
      conquestState: 'NOT_CONQUERED',
      conqueredInPastSeason: false,
      isSaved: false,
      myConquest: null,
      moving: null,
      rankPreview: expect.objectContaining({
        sigunguName: '강서구',
        conquestCount: 0,
        conquestCountAfter: 1,
        currentRank: null,
        rankAfterConquest: 1,
      }),
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
        overallScore: 4.5,
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
        myScore: 4.5,
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
  let fetchMock: ReturnType<typeof stubKakao>;
  beforeEach(() => {
    fetchMock = stubKakao();
  });

  it('기본 정보·영업시간·별점·항목별 평균·비율을 준다', async () => {
    await createActiveSeason();
    const me = await createMember();
    fetchMock = stubKakao({
      keyword: () => [
        kakaoPlace({ id: '1234567890', place_name: '새맛집', phone: '02-1234-5678' }),
      ],
    });
    const r = await createRestaurant({
      kakaoPlaceId: '1234567890',
      name: '새맛집',
      categoryDetail: '백반/한정식',
      roadAddress: '서울 강서구 가양로 123',
      jibunAddress: '서울 강서구 가양동 1487',
      lat: 37.5627,
      lng: 126.8572,
      businessHours: { ...HOURS, sun: undefined },
    });
    await giveStats(r.id);
    await prisma.member.update({ where: { id: me.id }, data: { weightService: 3 } });

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
      categoryDetail: '백반/한정식',
      imageUrl: null,
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
      rating: { score: 4.2, reviewCount: 5 },
      // 서비스만 아주 중요: (4.2 + 4.3 + 4.0 + 4.7×3 + 3.7) ÷ 7 = 4.33
      myOverall: {
        score: 4.3,
        items: [
          { key: 'taste', average: 4.2, weightPercent: 15 },
          { key: 'cleanliness', average: 4.3, weightPercent: 14 },
          { key: 'portion', average: 4, weightPercent: 14 },
          { key: 'service', average: 4.7, weightPercent: 43 },
          { key: 'price', average: 3.7, weightPercent: 14 },
        ],
      },
      hasMapae: false,
      stats: {
        cleanliness: 4.3,
        portion: 4,
        service: 4.7,
        price: 3.7,
        revisitIntentCount: 2,
        revisitIntentRate: 40,
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

  describe('카카오 실시간 조회 (전화번호는 저장하지 않고, 장소 ID만 저장)', () => {
    it('장소 ID가 없으면 가게 이름으로 100m 안을 찾아 이름이 맞는 가장 가까운 곳의 ID를 저장한다', async () => {
      const me = await createMember();
      const r = await createRestaurant({ name: '스이루 중앙대점', lat: 37.5627, lng: 126.8572 });
      fetchMock = stubKakao({
        keyword: () => [
          kakaoPlace({ id: '111', place_name: '옆집국밥', phone: '02-111-1111' }),
          kakaoPlace({ id: '222', place_name: '스이루 중앙대점', phone: '02-222-2222' }),
        ],
      });

      const res = await detail(me.id, r.id);

      expect(res.body.data).toMatchObject({
        kakaoPlaceId: '222',
        phone: '02-222-2222',
        kakaoPlaceUrl: 'https://place.map.kakao.com/222',
      });
      const [params] = kakaoCalls(fetchMock, '/v2/local/search/keyword.json');
      expect(Object.fromEntries(params)).toEqual({
        query: '스이루 중앙대점',
        x: '126.8572',
        y: '37.5627',
        radius: '100',
        sort: 'distance',
        size: '15',
      });
      const saved = await prisma.restaurant.findUniqueOrThrow({ where: { id: r.id } });
      expect(saved.kakaoPlaceId).toBe('222');
    });

    it('이름이 맞는 곳이 없으면 전화번호·링크 없이 null', async () => {
      const me = await createMember();
      const r = await createRestaurant({ name: '새맛집' });
      stubKakao({ keyword: () => [kakaoPlace({ id: '111', place_name: '옆집국밥' })] });
      const res = await detail(me.id, r.id);
      expect(res.body.data).toMatchObject({ kakaoPlaceId: null, phone: null, kakaoPlaceUrl: null });
    });

    it('다른 가게가 이미 같은 장소 ID를 가졌으면 저장하지 않고 응답에만 쓴다', async () => {
      const me = await createMember();
      await createRestaurant({ name: '새맛집', kakaoPlaceId: '333' });
      const r = await createRestaurant({ name: '새맛집' });
      stubKakao({ keyword: () => [kakaoPlace({ id: '333', place_name: '새맛집' })] });
      const res = await detail(me.id, r.id);
      expect(res.status).toBe(200);
      expect(res.body.data.kakaoPlaceId).toBe('333');
      const saved = await prisma.restaurant.findUniqueOrThrow({ where: { id: r.id } });
      expect(saved.kakaoPlaceId).toBeNull();
    });

    it('카카오가 실패하면 전화번호는 null, 저장해 둔 장소 ID로 링크는 준다', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const me = await createMember();
      const r = await createRestaurant({ kakaoPlaceId: '444' });
      stubKakao({ keyword: () => 500 });
      const res = await detail(me.id, r.id);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        kakaoPlaceId: '444',
        phone: null,
        kakaoPlaceUrl: 'https://place.map.kakao.com/444',
      });
    });
  });

  it('마패가 붙은 가게는 hasMapae true', async () => {
    const me = await createMember();
    const r = await createRestaurant({ hasMapae: true });
    const res = await detail(me.id, r.id);
    expect(res.body.data.hasMapae).toBe(true);
  });

  it('인증 리뷰가 5개 미만이면 계산해 둔 별점이 있어도 숨긴다 (내 종합도 null)', async () => {
    const me = await createMember();
    const r = await createRestaurant();
    await prisma.restaurantStat.create({
      data: { restaurantId: r.id, reviewCount: 4, displayScore: 4.6 },
    });
    const res = await detail(me.id, r.id);
    expect(res.body.data.rating).toEqual({ score: null, reviewCount: 4 });
    expect(res.body.data.myOverall.score).toBeNull();
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
      myOverall: { score: null },
      stats: {
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
        overallScore: 4.5,
      },
    });
    const conqueredRes = await detail(me.id, conqueredRestaurant.id);
    expect(conqueredRes.body.data.my).toEqual({
      conquestState: 'CONQUERED',
      conqueredInPastSeason: false,
      conqueredAt: toKstIso(conquest.conqueredAt),
      myScore: 4.5,
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

describe('가게 대표 사진 (restaurant_stat.cover_image_key)', () => {
  it('공개 리뷰 중 가장 최근 것의 첫 사진, 블라인드된 리뷰 사진은 쓰지 않는다', async () => {
    const shop = await createRestaurant();
    const review = async (daysAgo: number, keys: string[]) => {
      const user = await createMember();
      const visit = await createVisit(user.id, shop.id);
      return prisma.review.create({
        data: {
          visitId: visit.id,
          userId: user.id,
          restaurantId: shop.id,
          overallScore: 4,
          imageCount: keys.length,
          regDate: new Date(Date.now() - daysAgo * 86_400_000),
          reviewImages: { create: keys.map((imageKey, sortOrder) => ({ imageKey, sortOrder })) },
        },
      });
    };
    const coverOf = async () =>
      (await prisma.restaurantStat.findUniqueOrThrow({ where: { restaurantId: shop.id } }))
        .coverImageKey;

    await review(3, ['review/old-1.jpg']);
    const latest = await review(1, ['review/new-1.jpg', 'review/new-2.jpg']);
    await review(0, []); // 사진 없는 리뷰는 건너뛴다
    await refreshRestaurantStat(prisma, shop.id);
    expect(await coverOf()).toBe('review/new-1.jpg');

    await prisma.review.update({ where: { id: latest.id }, data: { status: 'H' } });
    await refreshRestaurantStat(prisma, shop.id);
    expect(await coverOf()).toBe('review/old-1.jpg');
  });
});
