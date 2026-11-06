// 알림 API (NOTI-01~05)

import { api } from '../lib/api';
import type { Page } from './reviews';

export type NotificationCategory = 'RANK' | 'REVIEW' | 'MUKKAEBI' | 'NOTICE';

export type AppNotification = {
  notificationId: number;
  category: NotificationCategory;
  type: string;
  title: string;
  content: string | null;
  isRead: boolean;
  /** 눌렀을 때 갈 화면 (없으면 null) */
  deepLink: string | null;
  regDate: string;
};

/** NOTI-01 알림 목록 (30일 이내, 최신순) */
export const getNotifications = (query: {
  category?: NotificationCategory;
  page?: number;
  size?: number;
}) => api.get<Page<AppNotification> & { unreadCount: number }>('/notifications', query);

/** NOTI-03 읽음 */
export const readNotification = (notificationId: number) =>
  api.patch<{ notificationId: number; isRead: true; deepLink: string | null }>(
    `/notifications/${notificationId}/read`,
  );

/** NOTI-04 모두 읽음 (category를 주면 그 종류만) */
export const readAllNotifications = (category?: NotificationCategory) =>
  api.patch<unknown>('/notifications/read-all', { category });

/** NOTI-05 알림 지우기 */
export const deleteNotification = (notificationId: number) =>
  api.delete<unknown>(`/notifications/${notificationId}`);
