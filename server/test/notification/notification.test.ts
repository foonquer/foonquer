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
    expect(rankOnly.body.data.items[0].deepLink).toBe('/status/sigungus/15');

    const count = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', bearer(me.id));
    expect(count.body.data).toMatchObject({ unreadCount: 2, byCategory: { RANK: 1, REVIEW: 1 } });

    const id = list.body.data.items[0].notificationId as number;
    const read = await request(app)
      .patch(`/api/v1/notifications/${id}/read`)
      .set('Authorization', bearer(me.id));
    expect(read.body.data).toMatchObject({ isRead: true, deepLink: '/reviews/7' });
    const all = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', bearer(me.id))
      .send({});
    expect(all.body.data.updatedCount).toBe(2); // 31일 지난 알림도 안 읽은 것은 읽음 처리
    const otherId = (await prisma.notification.findFirstOrThrow({ where: { userId: other.id } }))
      .id;
    expect(
      (
        await request(app)
          .delete(`/api/v1/notifications/${otherId}`)
          .set('Authorization', bearer(me.id))
      ).body.code,
    ).toBe('NOTIFICATION_NOT_FOUND');
    expect(
      (await request(app).delete(`/api/v1/notifications/${id}`).set('Authorization', bearer(me.id)))
        .status,
    ).toBe(200);
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
  });
});
