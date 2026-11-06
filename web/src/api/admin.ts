// 운영 관리 API (ADMIN-01·02 신고, ADMIN-08·09 문의). 운영자(member.role = A)만 부를 수 있다

import { api } from '../lib/api';
import type { InquiryCategory } from './support';
import type { ReportReason } from './profile';
import type { Page } from './reviews';

export type ReportStatus = 'PENDING' | 'DONE' | 'REJECTED';
export type ReportAction = 'HIDE_REVIEW' | 'FAKE_REVIEW' | 'SUSPEND_MEMBER' | 'REJECT';

export type AdminReport = {
  reportId: number;
  targetType: 'REVIEW' | 'MEMBER';
  targetId: number;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  regDate: string;
  processedAt: string | null;
  reporter: { userId: number; nickname: string | null };
  /** 같은 대상에 쌓인 처리 전 신고 수 (이 신고 포함) */
  pendingCount: number;
  review: {
    reviewId: number;
    status: 'VISIBLE' | 'HIDDEN' | 'FAKE' | 'DELETED';
    overallScore: number;
    content: string | null;
    author: { userId: number; nickname: string | null };
    restaurant: { restaurantId: number; name: string };
  } | null;
  member: {
    userId: number;
    nickname: string | null;
    status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN';
    trustTemp: number;
  } | null;
};

/** ADMIN-01 신고 목록 (오래된 순) */
export const getReports = (query: {
  status: ReportStatus;
  targetType?: 'REVIEW' | 'MEMBER';
  page?: number;
  size?: number;
}) => api.get<Page<AdminReport>>('/admin/reports', query);

/** ADMIN-02 신고 처리. 조치하면 같은 대상의 처리 전 신고도 함께 끝난다(closedCount) */
export const processReport = (reportId: number, action: ReportAction) =>
  api.patch<{ reportId: number; status: ReportStatus; closedCount: number }>(
    `/admin/reports/${reportId}`,
    { action },
  );

export type AdminInquiry = {
  inquiryId: number;
  category: InquiryCategory;
  content: string;
  imageUrl: string | null;
  refVisitId: number | null;
  user: { userId: number; nickname: string | null };
  status: 'WAITING' | 'ANSWERED';
  answer: string | null;
  regDate: string;
  answeredAt: string | null;
};

/** ADMIN-08 문의 목록 (오래된 순) */
export const getInquiries = (query: {
  status: 'WAITING' | 'ANSWERED';
  page?: number;
  size?: number;
}) => api.get<Page<AdminInquiry>>('/admin/inquiries', query);

/** ADMIN-09 문의 답변 (고쳐 쓸 수 있다. 처음 답할 때만 문의한 사람에게 알림) */
export const answerInquiry = (inquiryId: number, answer: string) =>
  api.patch<{ inquiryId: number; status: 'ANSWERED'; answeredAt: string; notified: boolean }>(
    `/admin/inquiries/${inquiryId}/answer`,
    { answer },
  );
