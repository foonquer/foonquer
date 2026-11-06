import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { addDays } from '../../src/common/time';
import { prisma } from '../../src/lib/prisma';
import { notify } from '../../src/modules/notification/notify';
import { resetDb } from '../helpers/db';
import { bearer, createMember } from '../helpers/fixtures';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

describe('NOTI 알림함·푸시 구독', () => {
  it('목록(30일 이내, 종류 거르기, deepLink), 안 읽은 수, 읽음·모두 읽음·삭제', async () => {
    const me = await createMember();
    const other = await createMember();
    await notify(prisma, me.id, {
      category: 'RANK',
      type: 'TIER_UP',
      title: '강서구 단골로 올랐어요!',
      content: '8위',
      refType: 'SIGUNGU',
      refId: 15,
    });
    await notify(prisma, me.id, {
      category: 'REVIEW',
      type: 'HELPFUL',
      title: '도움돼요 3개',
      content: '',
      refType: 'REVIEW',
      refId: 7,
    });
    await notify(
      prisma,
      me.id,
      { category: 'NOTICE', type: 'NOTICE', title: '옛 알림', content: '' },
      addDays(new Date(), -31),
    );
    await notify(prisma, other.id, {
      category: 'RANK',
      type: 'TIER_UP',
      title: '남의 알림',
      content: '',
    });

    const list = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', bearer(me.id));
    expect(list.body.data).toMatchObject({ unreadCount: 2, totalCount: 2 });
    expect(list.body.data.items[0]).toMatchObject({
      type: 'HELPFUL',
      deepLink: '/reviews/7',
      isRead: false,
    });
    const rankOnly = await request(app)
      .get('/api/v1/notifications?category=RANK')
      .set('Authorization', bearer(me.id));
    expect(rankOnly.body.data.items).toHaveLength(1);
    expect(rankOnly.body.data.items[0].deepLink).toBe('/ranking?sigunguId=15');

    const count = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', bearer(me.id));
    expect(count.body.data).toMatchObject({ unreadCount: 2, byCategory: { RANK: 1, REVIEW: 1 } });

    const id = list.body.data.items[0].notificationId as number;
    const read = await request(app)
      .patch(`/api/v1/notifications/${id}/read`)
      .set('Authorization', bearer(me.id));
    expect(read.body.data).toMatchObject({ isRead: true, deepLink: '/reviews/7' });
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: BigInt(id) } })).isRead,
    ).toBe(true);

    const rankRead = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', bearer(me.id))
      .send({ category: 'RANK' });
    expect(rankRead.body.data.updatedCount).toBe(1);
    const all = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', bearer(me.id))
      .send({});
    expect(all.body.data.updatedCount).toBe(1); // 31일 지난 알림도 안 읽은 것은 읽음 처리
    expect(await prisma.notification.count({ where: { userId: other.id, isRead: false } })).toBe(1);

    const otherId = (await prisma.notification.findFirstOrThrow({ where: { userId: other.id } }))
      .id;
    for (const req of [
      request(app).patch(`/api/v1/notifications/${otherId}/read`),
      request(app).delete(`/api/v1/notifications/${otherId}`),
    ]) {
      const res = await req.set('Authorization', bearer(me.id));
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOTIFICATION_NOT_FOUND');
    }
    expect(await prisma.notification.findUniqueOrThrow({ where: { id: otherId } })).toMatchObject({
      isRead: false,
    });

    const del = () =>
      request(app).delete(`/api/v1/notifications/${id}`).set('Authorization', bearer(me.id));
    expect((await del()).status).toBe(200);
    expect(await prisma.notification.findUnique({ where: { id: BigInt(id) } })).toBeNull();
    expect((await del()).status).toBe(404);
  });

  it('잘못된 종류는 400, 로그인하지 않으면 401', async () => {
    const me = await createMember();
    const bad = await request(app)
      .get('/api/v1/notifications?category=SHOP')
      .set('Authorization', bearer(me.id));
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_NOTIFICATION_CATEGORY');
    const badBody = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', bearer(me.id))
      .send({ category: 'SHOP' });
    expect(badBody.body.code).toBe('INVALID_NOTIFICATION_CATEGORY');
    expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
  });

  it('Web Push 구독 등록(같은 endpoint는 한 행)·해제', async () => {
    const me = await createMember();
    const body = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'key', auth: 'auth' },
    };
    const put = () =>
      request(app)
        .put('/api/v1/notifications/push-subscription')
        .set('Authorization', bearer(me.id))
        .send(body);
    expect((await put()).body.data.subscribed).toBe(true);
    await put();
    expect(await prisma.pushSubscription.count()).toBe(1);
    const del = await request(app)
      .delete('/api/v1/notifications/push-subscription')
      .set('Authorization', bearer(me.id))
      .send({ endpoint: body.endpoint });
    expect(del.body.data.subscribed).toBe(false);
    expect(await prisma.pushSubscription.count()).toBe(0);
    const bad = await request(app)
      .put('/api/v1/notifications/push-subscription')
      .set('Authorization', bearer(me.id))
      .send({ endpoint: 'nope' });
    expect(bad.body.code).toBe('INVALID_PUSH_SUBSCRIPTION');
    const emptyKey = await request(app)
      .put('/api/v1/notifications/push-subscription')
      .set('Authorization', bearer(me.id))
      .send({ ...body, keys: { p256dh: '', auth: 'auth' } });
    expect(emptyKey.status).toBe(400);
    expect(emptyKey.body.code).toBe('INVALID_PUSH_SUBSCRIPTION');
  });

  it('다른 회원이 쓰던 브라우저 endpoint를 등록하면 나에게 옮긴다', async () => {
    const before = await createMember();
    const me = await createMember();
    const body = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/shared',
      keys: { p256dh: 'key', auth: 'auth' },
    };
    for (const user of [before, me]) {
      await request(app)
        .put('/api/v1/notifications/push-subscription')
        .set('Authorization', bearer(user.id))
        .send(body);
    }
    const rows = await prisma.pushSubscription.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(me.id);
  });
});
