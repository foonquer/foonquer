import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from '../helpers/db';
import { bearer, createActiveSeason, createMember, createRestaurant } from '../helpers/fixtures';
import { conquerMany } from '../helpers/game';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

describe('HOME-01·USER-08·MAP-02 순위 미리보기·USER-05 소개글', () => {
  it('홈 요약과 내 정보 요약', async () => {
    await createActiveSeason(3);
    const season = await prisma.season.findFirstOrThrow();
    const me = await createMember({ nickname: '아기깨비' });
    const king = await createMember();
    await conquerMany(king.id, season.id, 7);
    await conquerMany(me.id, season.id, 5);

    const home = await request(app).get('/api/v1/home/summary').set('Authorization', bearer(me.id));
    expect(home.status).toBe(200);
    expect(home.body.data).toMatchObject({
      title: '강서구 단골',
      season: { seasonNo: 3 },
      rank: {
        conquestCount: 5,
        main: { sigunguName: '강서구', rank: 2, tier: 'REGULAR', mukjjangGap: 3 },
      },
    });
    expect(home.body.data.celebrationCount).toBeGreaterThan(0);
    expect(home.body.data.unreadNotificationCount).toBeGreaterThan(0);

    const mine = await request(app)
      .get('/api/v1/users/me/summary')
      .set('Authorization', bearer(me.id));
    expect(mine.body.data).toMatchObject({
      nickname: '아기깨비',
      seasonRecord: { conquestCount: 5, reviewCount: 0 },
      savedRestaurantCount: 0,
    });
    expect(mine.body.data.titleCount).toBeGreaterThanOrEqual(2);
  });

  it('가게 미리보기: 아직 정복하지 않은 가게면 정복 후 순위를 알려 준다', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    const rival = await createMember();
    await conquerMany(rival.id, season.id, 3);
    await conquerMany(me.id, season.id, 3);
    const shop = await createRestaurant();
    const res = await request(app)
      .get(`/api/v1/restaurants/${shop.id}/preview`)
      .set('Authorization', bearer(me.id));
    expect(res.body.data.rankPreview).toMatchObject({
      conquestCount: 3,
      conquestCountAfter: 4,
      currentRank: 2,
      rankAfterConquest: 1,
    });
  });

  it('프로필 수정에서 소개글을 바꾸고 지운다', async () => {
    const me = await createMember();
    const patch = (bio: string | null) =>
      request(app).patch('/api/v1/users/me').set('Authorization', bearer(me.id)).send({ bio });
    expect((await patch('국밥·칼국수 위주로 다녀요')).body.data.bio).toBe(
      '국밥·칼국수 위주로 다녀요',
    );
    expect(
      (await request(app).get('/api/v1/users/me').set('Authorization', bearer(me.id))).body.data
        .bio,
    ).toBe('국밥·칼국수 위주로 다녀요');
    const tooLong = await patch('a'.repeat(61));
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.code).toBe('BIO_TOO_LONG');
    // 60자까지는 된다 (이모지도 1자로 센다)
    const emoji = '🍜'.repeat(60);
    expect((await patch(emoji)).status).toBe(200);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: me.id } })).bio).toBe(emoji);
    expect((await patch(null)).body.data.bio).toBeNull();
    expect((await prisma.member.findUniqueOrThrow({ where: { id: me.id } })).bio).toBeNull();
  });

  it('내 정보 요약의 받은 도움돼요는 이번 시즌 리뷰만 센다', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    const shops = await conquerMany(me.id, season.id, 1);
    const visit = await prisma.visit.findFirstOrThrow({ where: { userId: me.id } });
    await prisma.review.create({
      data: {
        visitId: visit.id,
        userId: me.id,
        restaurantId: shops[0].id,
        overallScore: 4,
        helpfulCount: 3,
      },
    });
    const pastSeason = await prisma.season.create({
      data: {
        seasonNo: 2,
        startDate: new Date('2026-03-01'),
        endDate: new Date('2026-08-31'),
        status: 'F',
      },
    });
    const [old] = await conquerMany(me.id, pastSeason.id, 1);
    const oldVisit = await prisma.visit.findFirstOrThrow({
      where: { userId: me.id, seasonId: pastSeason.id },
    });
    await prisma.review.create({
      data: {
        visitId: oldVisit.id,
        userId: me.id,
        restaurantId: old.id,
        overallScore: 4,
        helpfulCount: 10,
      },
    });
    const mine = await request(app)
      .get('/api/v1/users/me/summary')
      .set('Authorization', bearer(me.id));
    expect(mine.body.data.seasonRecord).toMatchObject({ reviewCount: 1, helpfulReceived: 3 });
  });
});
