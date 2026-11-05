import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { sha256Hex } from '../../common/crypto';
import { pageQuery, toPageResult } from '../../common/pagination';
import { addDays, toKstIso } from '../../common/time';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { NotificationError } from './notification.errors';

// NOTI-01~06·09 알림함·Web Push 구독 (ERD notification, push_subscription). 알림은 30일 동안 보관한다.
// NOTI-07·08(알림 설정)은 SET-01·02로 대신한다 (ERD 기준: member 알림 컬럼 + member_consent)

export const KEEP_DAYS = 30;
const category = z.enum(['RANK', 'REVIEW', 'MUKKAEBI', 'NOTICE'], {
  error: 'INVALID_NOTIFICATION_CATEGORY',
});

export const notificationListQuery = z.object({ ...pageQuery, category: category.optional() });
export type NotificationListQuery = z.infer<typeof notificationListQuery>;
export const notificationParams = z.object({ notificationId: z.coerce.number().int().positive() });
export const readAllBody = z.object({ category: category.optional() });
const PUSH_ERROR = { error: 'INVALID_PUSH_SUBSCRIPTION' } as const;
const pushKey = z.string(PUSH_ERROR).min(1, PUSH_ERROR).max(255, PUSH_ERROR);

export const pushSubscriptionBody = z.object({
  endpoint: z
    .url({ error: 'INVALID_PUSH_SUBSCRIPTION' })
    .max(1024, { error: 'INVALID_PUSH_SUBSCRIPTION' }),
  keys: z.object(
    {
      p256dh: pushKey,
      auth: pushKey,
    },
    { error: 'INVALID_PUSH_SUBSCRIPTION' },
  ),
});
export type PushSubscriptionBody = z.infer<typeof pushSubscriptionBody>;
export const pushUnsubscribeBody = z.object({
  endpoint: z.string(PUSH_ERROR).min(1, PUSH_ERROR).max(1024, PUSH_ERROR),
});

/** 알림을 눌렀을 때 갈 화면 (프론트 경로) */
export function deepLinkOf(refType: string | null, refId: bigint | null) {
  const id = refId?.toString();
  switch (refType) {
    case 'RESTAURANT':
      return `/restaurants/${id}`;
    case 'REVIEW':
      return `/reviews/${id}`;
    case 'SIGUNGU':
      return `/status/sigungus/${id}`;
    case 'SEASON':
      return '/me/season-records';
    case 'ACHIEVEMENT':
      return '/me/achievements';
    case 'ITEM':
      return '/mukkaebi/items';
    case 'INQUIRY':
      return `/support/inquiries/${id}`;
    case 'NOTICE':
      return `/notices/${id}`;
    default:
      return null;
  }
}

const recent = (now: Date) => ({ gte: addDays(now, -KEEP_DAYS) });

/** NOTI-01 알림 목록 (30일 이내, 최신순) */
export async function listNotifications(
  userId: bigint,
  query: NotificationListQuery,
  now = new Date(),
) {
  const where: Prisma.NotificationWhereInput = {
    userId,
    regDate: recent(now),
    category: query.category,
  };
  const [rows, totalCount, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, regDate: recent(now), isRead: false } }),
  ]);
  const items = rows.map((n) => ({
    notificationId: n.id,
    category: n.category,
    type: n.type,
    title: n.title,
    content: n.content,
    isRead: n.isRead,
    deepLink: deepLinkOf(n.refType, n.refId),
    regDate: toKstIso(n.regDate),
  }));
  return { unreadCount, ...toPageResult(items, { ...query, totalCount }) };
}

/** NOTI-02 안 읽은 알림 수 (종 아이콘 빨간 점) */
export async function countUnread(userId: bigint, now = new Date()) {
  const rows = await prisma.notification.groupBy({
    by: ['category'],
    where: { userId, isRead: false, regDate: recent(now) },
    _count: { _all: true },
  });
  const byCategory = { RANK: 0, REVIEW: 0, MUKKAEBI: 0, NOTICE: 0 } as Record<string, number>;
  for (const r of rows) byCategory[r.category] = r._count._all;
  return { unreadCount: rows.reduce((s, r) => s + r._count._all, 0), byCategory };
}

/** NOTI-03 읽음 처리 (이미 읽었어도 성공) */
export async function readNotification(userId: bigint, notificationId: number) {
  const id = BigInt(notificationId);
  // 내 알림 조건을 쿼리에 넣어 동시에 지워져도 500이 아니라 404가 되게 한다
  const { count } = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });
  const n = count ? await prisma.notification.findUnique({ where: { id } }) : null;
  if (!n) throw new AppError(NotificationError.NOTIFICATION_NOT_FOUND);
  return { notificationId: n.id, isRead: true, deepLink: deepLinkOf(n.refType, n.refId) };
}

/** NOTI-04 모두 읽음 (category를 주면 그 종류만) */
export async function readAll(userId: bigint, category?: string) {
  const { count } = await prisma.notification.updateMany({
    where: { userId, isRead: false, category },
    data: { isRead: true },
  });
  return { updatedCount: count };
}

/** NOTI-05 알림 삭제 */
export async function deleteNotification(userId: bigint, notificationId: number) {
  const id = BigInt(notificationId);
  const { count } = await prisma.notification.deleteMany({ where: { id, userId } });
  if (count === 0) throw new AppError(NotificationError.NOTIFICATION_NOT_FOUND);
  return { notificationId: id, deleted: true };
}

/** NOTI-06 Web Push 구독 등록·갱신 (같은 브라우저 endpoint는 한 행, 다른 회원이 쓰던 것이면 나에게 옮긴다) */
export async function savePushSubscription(
  userId: bigint,
  body: PushSubscriptionBody,
  userAgent: string | undefined,
) {
  const endpointHash = sha256Hex(body.endpoint);
  const data = {
    userId,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    userAgent: userAgent?.slice(0, 255) ?? null,
  };
  await prisma.pushSubscription.upsert({
    where: { endpointHash },
    update: data,
    create: { ...data, endpointHash },
  });
  return { subscribed: true };
}

/** NOTI-09 Web Push 구독 해제 (로그아웃 때, 멱등) */
export async function deletePushSubscription(userId: bigint, endpoint: string) {
  await prisma.pushSubscription.deleteMany({
    where: { userId, endpointHash: sha256Hex(endpoint) },
  });
  return { subscribed: false };
}
