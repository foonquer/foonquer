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

describe('LIST-01~03 저장한 맛집', () => {
  it('저장·메모·알림 여부, 가고 싶은 곳(오래 저장한 순)·정복한 곳 나눠 보기, 저장 취소', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    const [a, b, c] = await Promise.all([
      createRestaurant(),
      createRestaurant(),
      createRestaurant(),
    ]);
    const save = (id: bigint, body: object = {}) =>
      request(app)
        .put(`/api/v1/users/me/saved-restaurants/${id}`)
        .set('Authorization', bearer(me.id))
        .send(body);

    const first = await save(a.id, { memo: '수제비도 맛있대요', remind: false });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      isSaved: true,
      memo: '수제비도 맛있대요',
      remind: false,
    });
    await prisma.savedRestaurant.update({
      where: { userId_restaurantId: { userId: me.id, restaurantId: a.id } },
      data: { regDate: new Date(Date.now() - 12 * 86_400_000) },
    });
    await save(b.id);
    await save(c.id);
    await createConquest(me.id, c, season.id);
    expect((await save(b.id, { memo: '주말엔 웨이팅' })).body.data.memo).toBe('주말엔 웨이팅');
    expect(
      (
        await prisma.savedRestaurant.findUniqueOrThrow({
          where: { userId_restaurantId: { userId: me.id, restaurantId: b.id } },
        })
      ).memo,
    ).toBe('주말엔 웨이팅');

    const want = await request(app)
      .get('/api/v1/users/me/saved-restaurants')
      .set('Authorization', bearer(me.id));
    expect(want.body.data.summary).toEqual({ totalCount: 3, wantCount: 2, conqueredCount: 1 });
    expect(want.body.data.items.map((i: { restaurantId: number }) => i.restaurantId)).toEqual([
      Number(a.id),
      Number(b.id),
    ]);
    expect(want.body.data.items[0]).toMatchObject({
      savedDaysAgo: 12,
      regionLabel: '서울특별시 강서구',
    });
    expect(want.body.data.pins).toHaveLength(3);
    const page2 = await request(app)
      .get('/api/v1/users/me/saved-restaurants?size=1&page=2')
      .set('Authorization', bearer(me.id));
    expect(page2.body.data).toMatchObject({ totalCount: 2, hasNext: false });
    expect(page2.body.data.items.map((i: { restaurantId: number }) => i.restaurantId)).toEqual([
      Number(b.id),
    ]);

    const done = await request(app)
      .get('/api/v1/users/me/saved-restaurants?tab=CONQUERED')
      .set('Authorization', bearer(me.id));
    expect(done.body.data.items).toHaveLength(1);
    expect(done.body.data.items[0].conqueredAt).not.toBeNull();

    const removed = await request(app)
      .delete(`/api/v1/users/me/saved-restaurants/${a.id}`)
      .set('Authorization', bearer(me.id));
    expect(removed.body.data).toMatchObject({ isSaved: false });
    expect(
      (await prisma.restaurantStat.findUniqueOrThrow({ where: { restaurantId: a.id } })).saveCount,
    ).toBe(0);
    const tooLong = await save(a.id, { memo: 'a'.repeat(51) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.code).toBe('MEMO_TOO_LONG');
    // 거절된 요청은 다시 저장하지 않는다
    expect(
      await prisma.savedRestaurant.findUnique({
        where: { userId_restaurantId: { userId: me.id, restaurantId: a.id } },
      }),
    ).toBeNull();
    expect(
      (await prisma.restaurantStat.findUniqueOrThrow({ where: { restaurantId: a.id } })).saveCount,
    ).toBe(0);
  });
});
