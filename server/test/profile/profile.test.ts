import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from '../helpers/db';
import {
  bearer,
  createActiveSeason,
  createConquest,
  createMember,
  createRestaurant,
} from '../helpers/fixtures';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

describe('PROFILE·PICK·REPORT·BLOCK', () => {
  it('탐방러 프로필: 소개글·신뢰 온도·이번 시즌 기록·누적 정복·PICK, 다녀온 가게', async () => {
    const season = await createActiveSeason(3);
    const viewer = await createMember();
    const explorer = await createMember({ nickname: '동네미식가', bio: '강서구 토박이 10년차' });
    const shops = await Promise.all([
      createRestaurant({ name: '옛날손칼국수' }),
      createRestaurant(),
    ]);
    for (const shop of shops) await createConquest(explorer.id, shop, season.id);
    await prisma.seasonRegionStat.create({
      data: {
        seasonId: season.id,
        sigunguId: shops[0].sigunguId,
        userId: explorer.id,
        conquestCount: 2,
        rankNo: 1,
        tier: 'M',
      },
    });

    const picks = await request(app)
      .put('/api/v1/users/me/picks')
      .set('Authorization', bearer(explorer.id))
      .send({
        picks: [{ restaurantId: Number(shops[0].id), comment: '비 오는 날엔 무조건 여기' }],
      });
    expect(picks.status).toBe(200);
    expect(picks.body.data.picks[0]).toMatchObject({
      order: 1,
      name: '옛날손칼국수',
      visitCount: 1,
    });

    const res = await request(app)
      .get(`/api/v1/users/${explorer.id}/profile`)
      .set('Authorization', bearer(viewer.id));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      nickname: '동네미식가',
      bio: '강서구 토박이 10년차',
      trustTemp: 50,
      title: '강서구의 먹짱',
      currentSeason: { seasonNo: 3, conquestCount: 2, best: { rank: 1, tier: 'MUKJJANG' } },
      totalConquestCount: 2,
      counts: { visitedRestaurants: 2, reviews: 0, picks: 1 },
      isMe: false,
      isBlocked: false,
    });

    const visited = await request(app)
      .get(`/api/v1/users/${explorer.id}/visited-restaurants`)
      .set('Authorization', bearer(viewer.id));
    expect(visited.body.data.totalCount).toBe(2);
  });

  it('PICK은 정복한 가게만, 10곳까지', async () => {
    const me = await createMember();
    const shop = await createRestaurant();
    const res = await request(app)
      .put('/api/v1/users/me/picks')
      .set('Authorization', bearer(me.id))
      .send({ picks: [{ restaurantId: Number(shop.id) }] });
    expect(res.body.code).toBe('PICK_NOT_CONQUERED');
    const many = Array.from({ length: 11 }, (_, i) => ({ restaurantId: i + 1 }));
    const tooMany = await request(app)
      .put('/api/v1/users/me/picks')
      .set('Authorization', bearer(me.id))
      .send({ picks: many });
    expect(tooMany.body.code).toBe('TOO_MANY_PICKS');
  });

  it('신고는 한 번만, 자기 자신은 안 되고, 차단하면 그 사람의 리뷰 탭이 비고 목록에 보인다', async () => {
    const me = await createMember();
    const other = await createMember({ nickname: '광고왕' });
    const report = (body: object) =>
      request(app).post('/api/v1/reports').set('Authorization', bearer(me.id)).send(body);
    const ok = await report({
      targetType: 'MEMBER',
      targetId: Number(other.id),
      reason: 'AD',
      detail: '협찬을 숨겨요',
    });
    expect(ok.status).toBe(201);
    expect(
      (await report({ targetType: 'MEMBER', targetId: Number(other.id), reason: 'SPAM' })).body
        .code,
    ).toBe('ALREADY_REPORTED');
    expect(
      (await report({ targetType: 'MEMBER', targetId: Number(me.id), reason: 'SPAM' })).body.code,
    ).toBe('CANNOT_REPORT_SELF');
    expect((await report({ targetType: 'REVIEW', targetId: 999, reason: 'SPAM' })).body.code).toBe(
      'REPORT_TARGET_NOT_FOUND',
    );

    const block = await request(app)
      .put(`/api/v1/users/me/blocks/${other.id}`)
      .set('Authorization', bearer(me.id));
    expect(block.body.data.isBlocked).toBe(true);
    const list = await request(app)
      .get('/api/v1/users/me/blocks')
      .set('Authorization', bearer(me.id));
    expect(list.body.data.items[0]).toMatchObject({ nickname: '광고왕' });
    const reviews = await request(app)
      .get(`/api/v1/users/${other.id}/reviews`)
      .set('Authorization', bearer(me.id));
    expect(reviews.body.data.totalCount).toBe(0);
    const profile = await request(app)
      .get(`/api/v1/users/${other.id}/profile`)
      .set('Authorization', bearer(me.id));
    expect(profile.body.data.isBlocked).toBe(true);

    await request(app)
      .delete(`/api/v1/users/me/blocks/${other.id}`)
      .set('Authorization', bearer(me.id));
    expect(await prisma.memberBlock.count()).toBe(0);
    expect(
      (
        await request(app)
          .put(`/api/v1/users/me/blocks/${me.id}`)
          .set('Authorization', bearer(me.id))
      ).body.code,
    ).toBe('CANNOT_BLOCK_SELF');
  });
});
