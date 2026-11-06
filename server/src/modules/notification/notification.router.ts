import { Router } from 'express';
import type { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { validate } from '../../common/middlewares/validate';
import { ok } from '../../common/response';
import {
  countUnread,
  deleteNotification,
  deletePushSubscription,
  listNotifications,
  type NotificationListQuery,
  notificationListQuery,
  notificationParams,
  type PushSubscriptionBody,
  pushSubscriptionBody,
  pushUnsubscribeBody,
  readAll,
  readAllBody,
  readNotification,
  savePushSubscription,
} from './notification.service';

type Params = z.infer<typeof notificationParams>;

/** /api/v1/notifications */
export const notificationRouter = Router();

// NOTI-01 알림 목록
notificationRouter.get(
  '/',
  requireAuth(),
  validate({ query: notificationListQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    ok(
      res,
      await listNotifications(userId, req.query as unknown as NotificationListQuery),
      '알림을 조회했어요.',
    );
  },
);

// NOTI-02 안 읽은 알림 수
notificationRouter.get('/unread-count', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await countUnread(userId), '안 읽은 알림 수를 조회했어요.');
});

// NOTI-04 모두 읽음 (/:id/read보다 먼저)
notificationRouter.patch(
  '/read-all',
  requireAuth(),
  validate({ body: readAllBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { category } = req.body as z.infer<typeof readAllBody>;
    ok(res, await readAll(userId, category), '모두 읽음으로 표시했어요.');
  },
);

// NOTI-06 Web Push 구독 등록
notificationRouter.put(
  '/push-subscription',
  requireAuth(),
  validate({ body: pushSubscriptionBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const data = await savePushSubscription(
      userId,
      req.body as PushSubscriptionBody,
      req.get('user-agent'),
    );
    ok(res, data, '푸시 알림을 켰어요.');
  },
);

// NOTI-09 Web Push 구독 해제
notificationRouter.delete(
  '/push-subscription',
  requireAuth(),
  validate({ body: pushUnsubscribeBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { endpoint } = req.body as z.infer<typeof pushUnsubscribeBody>;
    ok(res, await deletePushSubscription(userId, endpoint), '이 기기의 푸시 알림을 껐어요.');
  },
);

// NOTI-03 읽음 처리
notificationRouter.patch(
  '/:notificationId/read',
  requireAuth(),
  validate({ params: notificationParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { notificationId } = req.params as unknown as Params;
    ok(res, await readNotification(userId, notificationId), '알림을 읽었어요.');
  },
);

// NOTI-05 알림 삭제
notificationRouter.delete(
  '/:notificationId',
  requireAuth(),
  validate({ params: notificationParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { notificationId } = req.params as unknown as Params;
    ok(res, await deleteNotification(userId, notificationId), '알림을 지웠어요.');
  },
);
