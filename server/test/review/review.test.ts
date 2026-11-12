import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import * as achievement from '../../src/modules/achievement/achievement.service';
import * as storage from '../../src/lib/storage';
import { resetDb } from '../helpers/db';
import {
  bearer,
  createActiveSeason,
  createMember,
  createRestaurant,
  createVisit,
} from '../helpers/fixtures';
import { stubKakao } from '../helpers/kakao';
import { resetStorageMock } from '../helpers/storage-mock';

vi.mock('../../src/lib/storage', async () =>
  (await import('../helpers/storage-mock.js')).storageMock(),
);

const app = createApp();

beforeEach(async () => {
  await resetDb();
  resetStorageMock(storage);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** 별점 대기(V) 방문 인증 */
async function verified(userId: bigint, restaurantId: bigint, seasonId: number, data = {}) {
  return createVisit(userId, restaurantId, { status: 'V', seasonId, ...data });
}

function rate(userId: bigint, visitId: bigint, overallScore: number) {
  return request(app)
    .post(`/api/v1/visits/${visitId}/rating`)
    .set('Authorization', bearer(userId))
    .send({ overallScore });
}

describe('REVIEW-01 종합 별점 등록 및 정복 완료', () => {
  it('신뢰 온도는 한 주(월요일부터)에 +7°까지만 오른다', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    await prisma.trustTempLog.create({
      data: {
        userId: me.id,
        reason: 'REVIEW_WRITTEN',
        baseDelta: 6.9,
        appliedDelta: 6.9,
        tempAfter: 56.9,
        refType: 'REVIEW',
        refId: 999999,
      },
    });
    await prisma.member.update({ where: { id: me.id }, data: { trustTemp: 56.9 } });
    const shop = await createRestaurant();
    const visit = await verified(me.id, shop.id, season.id);
    await rate(me.id, visit.id, 4);
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: me.id } })).trustTemp.toNumber(),
    ).toBe(57); // +0.6 중 남은 0.1만
  });

  it('리뷰·정복·구 순위·먹깨비 위치·포인트·신뢰 온도·가게 별점을 한 번에 반영한다', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    const shop = await createRestaurant({ name: '새맛집' });
    const visit = await verified(me.id, shop.id, season.id);

    const res = await rate(me.id, visit.id, 4.5);
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('정복 완료! 먹깨비가 도착했어요.');
    expect(res.body.data).toMatchObject({
      overallScore: 4.5,
      conquest: {
        isNewConquest: true,
        isFirstEver: true,
        conquestCount: 1,
        rank: 1,
        tier: 'MUKJJANG',
      },
      celebrations: { tierUp: { from: 'BEGINNER', to: 'MUKJJANG' } },
    });
    // 이 구에서 첫 정복이라 이전 순위가 없고, 먹짱은 다음 티어가 없다
    expect(res.body.data.conquest).toMatchObject({ previousRank: null, nextTier: null });
    // 다음 정복 보상: 첫 정복은 받았고, 남은 수가 가장 적은 "3개 구 탐험"(1/3)
    expect(res.body.data.nextReward).toEqual({
      achievementId: expect.any(Number),
      name: '3개 구 탐험',
      conditionType: 'DISTRICT_COUNT',
      current: 1,
      target: 3,
      remaining: 2,
      rewardPoint: 100,
      rewardItems: [],
    });
    // 새 가게 첫 정복 +100, 티어 상승 +100 (방문 인증 +50은 인증 때 받음), 첫 정복 업적 +50
    expect(res.body.data.rewards.point).toBe(200);
    expect(res.body.data.celebrations.achievements.map((a: { code: string }) => a.code)).toEqual([
      'FIRST_CONQUEST',
    ]);

    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).status).toBe('C');
    expect(await prisma.conquest.count({ where: { userId: me.id } })).toBe(1);
    expect(
      (await prisma.mukkaebi.findUniqueOrThrow({ where: { userId: me.id } })).currentRestaurantId,
    ).toBe(shop.id);
    const member = await prisma.member.findUniqueOrThrow({ where: { id: me.id } });
    expect(member.trustTemp.toNumber()).toBe(50.6); // 리뷰 작성 +0.6°
    const stat = await prisma.restaurantStat.findUniqueOrThrow({
      where: { restaurantId: shop.id },
    });
    expect(stat).toMatchObject({ reviewCount: 1, conquerorCount: 1, revisitIntentCount: 1 });
    // 동네 평균 m = 3.5 (다른 리뷰 없음), w = 1 + (50.6 − 50) ÷ 50 = 1.012
    // R = (5 × 3.5 + 1.012 × 4.5) / (5 + 1.012) ≈ 3.7
    expect(stat.displayScore?.toNumber()).toBe(3.7);

    const again = await rate(me.id, visit.id, 3);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_RATED');
  });

  it('같은 시즌에 같은 가게를 다시 가면 정복 수는 그대로, 재방문 리뷰로 표시한다', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    const shop = await createRestaurant();
    await rate(me.id, (await verified(me.id, shop.id, season.id)).id, 4);
    const second = await rate(me.id, (await verified(me.id, shop.id, season.id)).id, 5);
    expect(second.body.data.conquest).toMatchObject({ isNewConquest: false, conquestCount: 1 });
    expect(second.body.message).toBe('별점을 남겼어요.');
    const reviews = await prisma.review.findMany({
      where: { userId: me.id },
      orderBy: { id: 'asc' },
    });
    expect(reviews.map((r) => r.isRevisit)).toEqual([false, true]);
  });

  it('5곳이면 단골, 다른 사람이 먹짱이 되면 먹짱이었던 사람에게 알림을 보낸다', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    const rival = await createMember();
    const shops = await Promise.all([1, 2, 3, 4, 5, 6].map(() => createRestaurant()));
    await rate(rival.id, (await verified(rival.id, shops[0].id, season.id)).id, 4);
    const results = [];
    for (const shop of shops.slice(0, 5))
      results.push(await rate(me.id, (await verified(me.id, shop.id, season.id)).id, 4));
    // 1곳: 먼저 1곳을 채운 사람에게 밀려 2위, 단골까지 4곳 → 2곳: 2위 → 1위
    expect(results[0].body.data.conquest).toMatchObject({
      rank: 2,
      previousRank: null,
      nextTier: { tierName: '단골', remaining: 4 },
    });
    expect(results[1].body.data.conquest).toMatchObject({ rank: 1, previousRank: 2 });

    const mine = await prisma.seasonRegionStat.findFirstOrThrow({ where: { userId: me.id } });
    expect(mine).toMatchObject({ conquestCount: 5, rankNo: 1, tier: 'M' });
    const theirs = await prisma.seasonRegionStat.findFirstOrThrow({ where: { userId: rival.id } });
    expect(theirs).toMatchObject({ rankNo: 2, tier: 'B' });
    const down = await prisma.notification.findFirstOrThrow({
      where: { userId: rival.id, type: 'TIER_DOWN' },
    });
    expect(down.title).toContain('먹짱 자리를 내줬어요');
    expect(
      await prisma.memberAchievement.count({
        where: { userId: me.id, achievement: { code: 'REGULAR_START' } },
      }),
    ).toBe(1);
  });

  it('다음 정복 보상은 아직 못 받은 정복 업적만 보고, 보상 아이템도 알려 준다', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    // 남은 수가 적은 정복 업적은 이미 받았다고 두면 "한 시즌 30곳 정복"(황금 방망이)이 남는다
    const done = await prisma.achievement.findMany({
      where: { code: { in: ['REGULAR_START', 'DISTRICT_3', 'DISTRICT_5'] } },
    });
    await prisma.memberAchievement.createMany({
      data: done.map((a) => ({ userId: me.id, achievementId: a.id })),
    });
    const shop = await createRestaurant();
    const res = await rate(me.id, (await verified(me.id, shop.id, season.id)).id, 4);
    expect(res.body.data.nextReward).toMatchObject({
      name: '한 시즌 30곳 정복',
      conditionType: 'SEASON_CONQUEST',
      current: 1,
      target: 30,
      remaining: 29,
      rewardItems: [{ code: 'CLUB_GOLD', name: '황금 방망이' }],
    });
  });

  it('다음 정복 보상 조회가 실패해도 정복은 끝났으니 201로 답하고 nextReward만 null', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    const shop = await createRestaurant();
    const visit = await verified(me.id, shop.id, season.id);
    vi.spyOn(achievement, 'nextConquestReward').mockRejectedValueOnce(new Error('DB 끊김'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await rate(me.id, visit.id, 4);
    expect(res.status).toBe(201);
    expect(res.body.data.nextReward).toBeNull();
    expect(res.body.data.conquest.isNewConquest).toBe(true);
  });

  it('한 구에서 10곳을 정복하면 구 배경을 얻고 바로 골라 둔다', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    for (let i = 0; i < 10; i += 1) {
      const shop = await createRestaurant();
      const res = await rate(me.id, (await verified(me.id, shop.id, season.id)).id, 4);
      if (i === 9)
        expect(res.body.data.celebrations.backgroundUnlocked).toMatchObject({
          sigunguName: '강서구',
        });
    }
    const mukkaebi = await prisma.mukkaebi.findUniqueOrThrow({ where: { userId: me.id } });
    expect(mukkaebi.bgSigunguId).not.toBeNull();
  });

  it('잘못된 별점은 400, 남의 방문은 404, 인증 전 방문은 409', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    const other = await createMember();
    const shop = await createRestaurant();
    const visit = await verified(me.id, shop.id, season.id);
    expect((await rate(me.id, visit.id, 4.3)).body.code).toBe('INVALID_OVERALL_SCORE');
    expect((await rate(me.id, visit.id, 0)).body.code).toBe('INVALID_OVERALL_SCORE');
    expect((await rate(other.id, visit.id, 4)).body.code).toBe('VISIT_NOT_FOUND');
    const reading = await createVisit(me.id, shop.id, { status: 'P', verifiedAt: null });
    expect((await rate(me.id, reading.id, 4)).body.code).toBe('VISIT_NOT_VERIFIED');
  });
});

describe('REVIEW-02·03·04·06·07 세부평가와 리뷰 목록', () => {
  async function ratedReview(userId: bigint, shopId: bigint, seasonId: number, score = 4) {
    const visit = await verified(userId, shopId, seasonId);
    await rate(userId, visit.id, score);
    return visit;
  }

  it('세부평가를 한 번 남기면 세부 별점 +20·글 +30·사진 +20, 두 번째는 409', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    const shop = await createRestaurant({ name: '새맛집' });
    const visit = await ratedReview(me.id, shop.id, season.id);
    const taste = await prisma.reviewAspect.findUniqueOrThrow({ where: { code: 'TASTE' } });
    const key = `review/${me.id}/${randomUUID()}.jpg`;

    const res = await request(app)
      .post(`/api/v1/visits/${visit.id}/review`)
      .set('Authorization', bearer(me.id))
      .send({
        detailScores: { cleanliness: 4, portion: 5, service: 4, price: 3 },
        aspects: [{ aspectId: taste.id, polarity: 'G' }],
        content: '제육 정식 추천해요.',
        imageKeys: [key],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.rewards.point).toBe(70);
    // 신뢰 온도: 리뷰 +0.6°, 세부평가(세부 별점·글) +0.3°
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: me.id } })).trustTemp.toNumber(),
    ).toBe(50.9);
    expect(res.body.data.review).toMatchObject({
      detailScores: { cleanliness: 4, price: 3 },
      aspects: [{ name: '맛', polarity: 'G' }],
      content: '제육 정식 추천해요.',
      imageCount: 1,
      isMine: true,
    });

    const twice = await request(app)
      .post(`/api/v1/visits/${visit.id}/review`)
      .set('Authorization', bearer(me.id))
      .send({ content: '또' });
    expect(twice.body.code).toBe('REVIEW_DETAIL_EXISTS');

    const stat = await prisma.restaurantStat.findUniqueOrThrow({
      where: { restaurantId: shop.id },
    });
    expect(stat).toMatchObject({
      detailReviewCount: 1,
      cleanlinessSum: 4,
      textReviewCount: 1,
      photoReviewCount: 1,
    });
    const aspectStat = await prisma.restaurantAspectStat.findFirstOrThrow({
      where: { restaurantId: shop.id },
    });
    expect(aspectStat.goodCount).toBe(1);
  });

  it('세부 별점은 네 개 모두 있어야 하고, 아무것도 없으면 400', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    const visit = await ratedReview(me.id, (await createRestaurant()).id, season.id);
    const post = (body: object) =>
      request(app)
        .post(`/api/v1/visits/${visit.id}/review`)
        .set('Authorization', bearer(me.id))
        .send(body);
    expect((await post({ detailScores: { cleanliness: 5 } })).body.code).toBe(
      'INVALID_DETAIL_SCORES',
    );
    expect((await post({})).body.code).toBe('REVIEW_DETAIL_EMPTY');
    expect((await post({ content: 'a'.repeat(301) })).body.code).toBe('REVIEW_CONTENT_TOO_LONG');
    const key = `review/${me.id}/a.jpg`;
    for (const imageKeys of [[''], [key, key]]) {
      const res = await post({ content: '사진', imageKeys });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_IMAGE_KEY');
    }
    expect((await post({ content: '사진', imageKeys: Array(6).fill(key) })).body.code).toBe(
      'TOO_MANY_IMAGES',
    );
  });

  it('음식점 리뷰 목록: 차단한 사람 제외, 작성자 신뢰 온도·칭호·로컬 표시, 별로예요 수는 없다', async () => {
    const season = await createActiveSeason(3);
    const viewer = await createMember();
    const writer = await createMember({ nickname: '동네미식가' });
    const blocked = await createMember();
    const shop = await createRestaurant();
    await ratedReview(writer.id, shop.id, season.id, 5);
    await ratedReview(blocked.id, shop.id, season.id, 1);
    await prisma.memberBlock.create({ data: { blockerId: viewer.id, blockedId: blocked.id } });

    const res = await request(app)
      .get(`/api/v1/restaurants/${shop.id}/reviews`)
      .set('Authorization', bearer(viewer.id));
    expect(res.status).toBe(200);
    expect(res.body.data.totalCount).toBe(1);
    const [card] = res.body.data.items;
    expect(card.author).toMatchObject({
      nickname: '동네미식가',
      trustTemp: 50.6,
      title: '강서구의 먹짱',
      isLocal: false,
    });
    expect(card).toMatchObject({
      verificationMethod: 'RECEIPT',
      overallScore: 5,
      myReaction: null,
      isMine: false,
    });
    expect(card).not.toHaveProperty('unhelpfulCount');

    const detail = await request(app)
      .get(`/api/v1/reviews/${card.reviewId}`)
      .set('Authorization', bearer(viewer.id));
    expect(detail.body.data.reviewId).toBe(card.reviewId);
  });

  it('재방문 의사 있음 필터는 맛 별점 3.0 이상만, 가게 stats에 그 수를 준다', async () => {
    const season = await createActiveSeason(3);
    const viewer = await createMember();
    const shop = await createRestaurant();
    for (const score of [3, 2.5, 4.5]) {
      await ratedReview((await createMember()).id, shop.id, season.id, score);
    }

    const res = await request(app)
      .get(`/api/v1/restaurants/${shop.id}/reviews`)
      .query({ revisitOnly: true })
      .set('Authorization', bearer(viewer.id));
    expect(res.status).toBe(200);
    expect(res.body.data.items.map((r: { overallScore: number }) => r.overallScore)).toEqual([
      4.5, 3,
    ]);

    stubKakao();
    const detail = await request(app)
      .get(`/api/v1/restaurants/${shop.id}`)
      .set('Authorization', bearer(viewer.id));
    expect(detail.body.data.stats).toMatchObject({ revisitIntentCount: 2, revisitIntentRate: 67 });
  });

  it('리뷰 수정은 보낸 항목만, 삭제는 세부평가만 지우고 종합 별점은 남긴다', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    const visit = await ratedReview(me.id, (await createRestaurant()).id, season.id, 3);
    const review = await prisma.review.findUniqueOrThrow({ where: { visitId: visit.id } });
    const oldKey = `review/${me.id}/${randomUUID()}.png`;
    await request(app)
      .post(`/api/v1/visits/${visit.id}/review`)
      .set('Authorization', bearer(me.id))
      .send({ content: '처음 글', imageKeys: [oldKey] });

    const patched = await request(app)
      .patch(`/api/v1/reviews/${review.id}`)
      .set('Authorization', bearer(me.id))
      .send({ overallScore: 4.5, content: '고친 글', imageKeys: [] });
    expect(patched.status).toBe(200);
    expect(patched.body.data.review).toMatchObject({
      overallScore: 4.5,
      content: '고친 글',
      imageCount: 0,
    });
    expect(storage.deleteObjectQuietly).toHaveBeenCalledWith(oldKey);

    const removed = await request(app)
      .delete(`/api/v1/reviews/${review.id}`)
      .set('Authorization', bearer(me.id));
    expect(removed.body.data).toMatchObject({ overallScore: 4.5, detailDeleted: true });
    const after = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
    expect(after).toMatchObject({ content: null, imageCount: 0, cleanliness: null, status: 'A' });

    const mine = await request(app)
      .get('/api/v1/users/me/reviews')
      .set('Authorization', bearer(me.id));
    expect(mine.body.data.items).toHaveLength(1);
  });
});

describe('REVIEW-08·09 도움돼요·별로예요', () => {
  async function setup() {
    const season = await createActiveSeason(3);
    const writer = await createMember();
    const shop = await createRestaurant({ name: '새맛집' });
    const visit = await verified(writer.id, shop.id, season.id);
    await rate(writer.id, visit.id, 4);
    const review = await prisma.review.findUniqueOrThrow({ where: { visitId: visit.id } });
    return { season, writer, shop, review };
  }
  const react = (userId: bigint, reviewId: bigint, type: string) =>
    request(app)
      .put(`/api/v1/reviews/${reviewId}/reaction`)
      .set('Authorization', bearer(userId))
      .send({ type });

  it('비방문자의 도움돼요: 작성자 +0.075°(× 누른 사람 온도 ÷ 50)·+5P, 누른 사람 +5P, 알림은 하루에 하나로 모은다', async () => {
    const { writer, review } = await setup();
    const a = await createMember();
    const b = await createMember();
    const res = await react(a.id, review.id, 'HELPFUL');
    expect(res.body.data).toMatchObject({ myReaction: 'HELPFUL', helpfulCount: 1 });
    await react(b.id, review.id, 'HELPFUL');

    const author = await prisma.member.findUniqueOrThrow({ where: { id: writer.id } });
    // 50 + 0.6(리뷰) + 0.075 × 2 (누른 사람이 50°라 1배, 소수 둘째 자리로 0.08)
    expect(author.trustTemp.toNumber()).toBe(50.76);
    const received = await prisma.pointHistory.count({
      where: { userId: writer.id, reason: 'HELPFUL_RECEIVED' },
    });
    expect(received).toBe(2);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: a.id } })).pointBalance).toBe(5);
    const notes = await prisma.notification.findMany({
      where: { userId: writer.id, type: 'HELPFUL' },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('새맛집 리뷰에 도움돼요 2개');

    const cancel = await request(app)
      .delete(`/api/v1/reviews/${review.id}/reaction`)
      .set('Authorization', bearer(a.id));
    expect(cancel.body.data).toMatchObject({ myReaction: null, helpfulCount: 1 });
  });

  it('방문자의 도움돼요는 +0.3° × 누른 사람 온도 ÷ 50 (80°면 1.6배)', async () => {
    const { season, writer, shop, review } = await setup();
    const visitor = await createMember({ trustTemp: 80 });
    await verified(visitor.id, shop.id, season.id);
    await react(visitor.id, review.id, 'HELPFUL');

    const log = await prisma.trustTempLog.findFirstOrThrow({
      where: { userId: writer.id, reason: 'HELPFUL_VISITOR' },
    });
    expect(log.baseDelta.toNumber()).toBe(0.48);
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: writer.id } })).trustTemp.toNumber(),
    ).toBe(51.08); // 50 + 0.6 + 0.48
  });

  it('같은 사람의 도움돼요는 4주(28일)에 3번까지만 온도에 반영한다', async () => {
    const { season, writer } = await setup();
    const fan = await createMember();
    const reviews = [];
    for (let i = 0; i < 4; i += 1) {
      const other = await createRestaurant();
      const visit = await verified(writer.id, other.id, season.id);
      await rate(writer.id, visit.id, 4);
      reviews.push(await prisma.review.findUniqueOrThrow({ where: { visitId: visit.id } }));
    }
    for (const r of reviews) await react(fan.id, r.id, 'HELPFUL');
    expect(
      await prisma.trustTempLog.count({
        where: { userId: writer.id, actorId: fan.id, reason: { startsWith: 'HELPFUL' } },
      }),
    ).toBe(3);
    expect(await prisma.reviewReaction.count({ where: { userId: fan.id, isCounted: false } })).toBe(
      1,
    );
  });

  it('자기 리뷰 403 OWN_REVIEW, 별로예요는 방문 인증한 사람만(403 VISIT_REQUIRED)', async () => {
    const { season, writer, shop, review } = await setup();
    expect((await react(writer.id, review.id, 'HELPFUL')).body.code).toBe('OWN_REVIEW');
    const guest = await createMember();
    expect((await react(guest.id, review.id, 'UNHELPFUL')).body.code).toBe('VISIT_REQUIRED');
    const visitor = await createMember();
    await verified(visitor.id, shop.id, season.id);
    const ok = await react(visitor.id, review.id, 'UNHELPFUL');
    expect(ok.status).toBe(200);
    expect(
      (await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).unhelpfulCount,
    ).toBe(1);
  });

  it('별로예요의 신뢰 가중 합이 3 이상이고 도움돼요의 2배 이상이면 작성자 온도 −0.5° (리뷰당 1번)', async () => {
    const { season, writer, shop, review } = await setup();
    const logs = () =>
      prisma.trustTempLog.count({ where: { userId: writer.id, reason: 'UNHELPFUL_MANY' } });
    for (let i = 0; i < 4; i += 1) {
      const visitor = await createMember();
      await verified(visitor.id, shop.id, season.id);
      await react(visitor.id, review.id, 'UNHELPFUL');
      // 방문자(50°) 한 표의 힘은 1 → 3표째에 깎는다
      expect(await logs()).toBe(i < 2 ? 0 : 1);
    }
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: writer.id } })).trustTemp.toNumber(),
    ).toBe(50.1); // 50 + 0.6(리뷰) − 0.5
    // 별로예요 4표: s = −1, k = 0.4 → w_help = 0.88, w = 1.002 × 0.88 ≈ 0.882
    const weight = (
      await prisma.review.findUniqueOrThrow({ where: { id: review.id } })
    ).scoreWeight.toNumber();
    expect(weight).toBe(0.882);
  });

  it('같은 사람이 같은 작성자에게 준 도움돼요는 한 달에 3번까지만 계산에 넣는다', async () => {
    const season = await createActiveSeason(3);
    const writer = await createMember();
    const fan = await createMember();
    const reviews = [];
    for (let i = 0; i < 4; i += 1) {
      const shop = await createRestaurant();
      const visit = await verified(writer.id, shop.id, season.id);
      await rate(writer.id, visit.id, 4);
      reviews.push(await prisma.review.findUniqueOrThrow({ where: { visitId: visit.id } }));
    }
    for (const r of reviews) await react(fan.id, r.id, 'HELPFUL');
    const counted = await prisma.reviewReaction.findMany({
      where: { userId: fan.id },
      orderBy: { id: 'asc' },
    });
    expect(counted.map((r) => r.isCounted)).toEqual([true, true, true, false]);
    expect(
      await prisma.pointHistory.count({ where: { userId: writer.id, reason: 'HELPFUL_RECEIVED' } }),
    ).toBe(3);

    // 취소하고 다시 눌러도 이번 달 한도(이미 준 3번)는 그대로다
    for (const r of reviews.slice(0, 3)) {
      const res = await request(app)
        .delete(`/api/v1/reviews/${r.id}/reaction`)
        .set('Authorization', bearer(fan.id));
      expect(res.status).toBe(200);
    }
    await request(app)
      .delete(`/api/v1/reviews/${reviews[3].id}/reaction`)
      .set('Authorization', bearer(fan.id));
    await react(fan.id, reviews[3].id, 'HELPFUL');
    expect(
      (
        await prisma.reviewReaction.findUniqueOrThrow({
          where: { reviewId_userId: { reviewId: reviews[3].id, userId: fan.id } },
        })
      ).isCounted,
    ).toBe(false);
    // 같은 리뷰를 다시 누르면 그 리뷰는 원래대로 계산에 들어간다
    await react(fan.id, reviews[0].id, 'HELPFUL');
    expect(
      (
        await prisma.reviewReaction.findUniqueOrThrow({
          where: { reviewId_userId: { reviewId: reviews[0].id, userId: fan.id } },
        })
      ).isCounted,
    ).toBe(true);
    expect(
      await prisma.pointHistory.count({ where: { userId: writer.id, reason: 'HELPFUL_RECEIVED' } }),
    ).toBe(3);
  });

  it('여러 사람이 동시에 눌러도 도움돼요 수가 맞고 500이 나지 않는다', async () => {
    const season = await createActiveSeason(3);
    const writer = await createMember();
    const shop = await createRestaurant();
    const visit = await verified(writer.id, shop.id, season.id);
    await rate(writer.id, visit.id, 4);
    const review = await prisma.review.findUniqueOrThrow({ where: { visitId: visit.id } });
    const fans = await Promise.all([1, 2, 3, 4].map(() => createMember()));
    const results = await Promise.all(
      [...fans, fans[0]].map((f) =>
        request(app)
          .put(`/api/v1/reviews/${review.id}/reaction`)
          .set('Authorization', bearer(f.id))
          .send({ type: 'HELPFUL' }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect((await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).helpfulCount).toBe(
      4,
    );
  });
});
