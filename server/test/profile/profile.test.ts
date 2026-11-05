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
  createVisit,
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

  it('PICK은 정복한 가게만, 10곳까지, 같은 가게 두 번 안 됨 — 거절되면 기존 PICK은 그대로', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    const mine = await createRestaurant({ name: '내가정복한집' });
    await createConquest(me.id, mine, season.id);
    const put = (picks: object[]) =>
      request(app)
        .put('/api/v1/users/me/picks')
        .set('Authorization', bearer(me.id))
        .send({ picks });
    expect((await put([{ restaurantId: Number(mine.id), comment: '국물 맛집' }])).status).toBe(200);

    const shop = await createRestaurant();
    const cases: [object[], string][] = [
      [[{ restaurantId: Number(shop.id) }], 'PICK_NOT_CONQUERED'],
      [Array.from({ length: 11 }, (_, i) => ({ restaurantId: i + 1 })), 'TOO_MANY_PICKS'],
      [[{ restaurantId: Number(mine.id) }, { restaurantId: Number(mine.id) }], 'PICK_DUPLICATE'],
      [[{ restaurantId: Number(mine.id), comment: 'a'.repeat(31) }], 'PICK_COMMENT_TOO_LONG'],
    ];
    for (const [picks, code] of cases) {
      const res = await put(picks);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(code);
    }
    expect(await prisma.memberPick.findMany({ where: { userId: me.id } })).toEqual([
      expect.objectContaining({ restaurantId: mine.id, sortOrder: 0, comment: '국물 맛집' }),
    ]);

    // 동시에 저장해도 500 없이 한 벌만 남는다
    const results = await Promise.all(
      [1, 2, 3].map(() => put([{ restaurantId: Number(mine.id) }])),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await prisma.memberPick.count({ where: { userId: me.id } })).toBe(1);

    const candidates = await request(app)
      .get('/api/v1/users/me/picks?keyword=정복')
      .set('Authorization', bearer(me.id));
    expect(candidates.body.data.candidates).toMatchObject({
      totalCount: 1,
      items: [{ restaurantId: Number(mine.id), isPicked: true, visitCount: 1 }],
    });
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
    expect(await prisma.report.findMany()).toEqual([
      expect.objectContaining({
        reporterId: me.id,
        targetType: 'M',
        targetId: other.id,
        reason: 'AD',
        detail: '협찬을 숨겨요',
      }),
    ]);
    const cases: [object, number, string][] = [
      [
        { targetType: 'MEMBER', targetId: Number(other.id), reason: 'SPAM' },
        409,
        'ALREADY_REPORTED',
      ],
      [
        { targetType: 'MEMBER', targetId: Number(me.id), reason: 'SPAM' },
        400,
        'CANNOT_REPORT_SELF',
      ],
      [{ targetType: 'REVIEW', targetId: 999, reason: 'SPAM' }, 404, 'REPORT_TARGET_NOT_FOUND'],
    ];
    for (const [body, status, code] of cases) {
      const res = await report(body);
      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
    }
    expect(await prisma.report.count()).toBe(1);

    // 차단 전에는 상대 리뷰가 보인다
    const shop = await createRestaurant();
    const visit = await createVisit(other.id, shop.id);
    await prisma.review.create({
      data: { visitId: visit.id, userId: other.id, restaurantId: shop.id, overallScore: 4 },
    });
    const before = await request(app)
      .get(`/api/v1/users/${other.id}/reviews`)
      .set('Authorization', bearer(me.id));
    expect(before.body.data.totalCount).toBe(1);

    // 동시에 두 번 차단해도 500 없이 한 행
    const blocks = await Promise.all(
      [1, 2].map(() =>
        request(app).put(`/api/v1/users/me/blocks/${other.id}`).set('Authorization', bearer(me.id)),
      ),
    );
    expect(blocks.map((b) => b.status)).toEqual([200, 200]);
    expect(blocks[0].body.data.isBlocked).toBe(true);
    expect(await prisma.memberBlock.count()).toBe(1);
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
