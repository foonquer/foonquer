import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from '../helpers/db';
import { bearer, createMember } from '../helpers/fixtures';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

describe('USER-09 GET /users/me/taste-weights', () => {
  it('고르지 않았으면 모두 보통, 비중은 20%씩', async () => {
    const me = await createMember();
    const res = await request(app)
      .get('/api/v1/users/me/taste-weights')
      .set('Authorization', bearer(me.id));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual(
      ['taste', 'cleanliness', 'portion', 'service', 'price'].map((key) => ({
        key,
        level: 'NORMAL',
        weightPercent: 20,
      })),
    );
  });
});

describe('USER-10 PUT /users/me/taste-weights', () => {
  const put = (userId: bigint, body: object) =>
    request(app)
      .put('/api/v1/users/me/taste-weights')
      .set('Authorization', bearer(userId))
      .send(body);

  it('다섯 항목을 저장하고 비중을 돌려준다 (피그마 3-2: 30·30·10·10·20%)', async () => {
    const me = await createMember();
    const res = await put(me.id, {
      taste: 'VERY',
      cleanliness: 'VERY',
      portion: 'NORMAL',
      service: 'NORMAL',
      price: 'IMPORTANT',
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('내 취향을 저장했어요. 내 종합 별점에 바로 반영돼요.');
    expect(res.body.data.items).toEqual([
      { key: 'taste', level: 'VERY', weightPercent: 30 },
      { key: 'cleanliness', level: 'VERY', weightPercent: 30 },
      { key: 'portion', level: 'NORMAL', weightPercent: 10 },
      { key: 'service', level: 'NORMAL', weightPercent: 10 },
      { key: 'price', level: 'IMPORTANT', weightPercent: 20 },
    ]);
    expect(await prisma.member.findUniqueOrThrow({ where: { id: me.id } })).toMatchObject({
      weightTaste: 3,
      weightCleanliness: 3,
      weightPortion: 1,
      weightService: 1,
      weightPrice: 2,
    });
  });

  it('하나라도 빠지거나 값이 틀리면 400 INVALID_TASTE_WEIGHT, 저장된 값은 그대로', async () => {
    const me = await createMember();
    const all = { taste: 'VERY', cleanliness: 'VERY', portion: 'VERY', service: 'VERY' };
    for (const body of [
      { taste: 'VERY' },
      {},
      { taste: 'VERY', cleanliness: 1 },
      { ...all, price: 'SUPER' }, // 넷은 맞고 하나만 틀림
    ]) {
      const res = await put(me.id, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_TASTE_WEIGHT');
      expect(await prisma.member.findUniqueOrThrow({ where: { id: me.id } })).toMatchObject({
        weightTaste: 1,
        weightCleanliness: 1,
        weightPortion: 1,
        weightService: 1,
        weightPrice: 1,
      });
    }
  });
});
