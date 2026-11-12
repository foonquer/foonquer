// 운영 관리 API (ADMIN-01·02 신고, ADMIN-08·09 문의, ADMIN-10~18 공지·FAQ·약관·회원). 운영자(member.role = A)만 부를 수 있다

import { api } from '../lib/api';
import type { InquiryCategory, TermsType } from './support';
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

export type Visibility = 'VISIBLE' | 'HIDDEN';

export type AdminNotice = {
  noticeId: number;
  title: string;
  tag: string | null;
  isPinned: boolean;
  status: Visibility;
  content: string;
  regDate: string;
  updatedAt: string | null;
};
export type NoticeInput = { title: string; content: string; tag: string | null; isPinned: boolean };

/** ADMIN-17 공지 목록 (숨긴 공지 포함, 필독 먼저 최신순) */
export const getAdminNotices = (page = 1) =>
  api.get<Page<AdminNotice>>('/admin/notices', { page, size: 20 });

/** ADMIN-10 공지 등록 */
export const createNotice = (body: NoticeInput) => api.post<unknown>('/admin/notices', body);

/** ADMIN-11 공지 고치기·숨기기 (보낸 항목만) */
export const updateNotice = (
  noticeId: number,
  body: Partial<NoticeInput> & { status?: Visibility },
) => api.patch<unknown>(`/admin/notices/${noticeId}`, body);

export type FaqCategory = 'VISIT' | 'RANK' | 'POINT' | 'ACCOUNT';
export const FAQ_CATEGORIES: { value: FaqCategory; label: string }[] = [
  { value: 'VISIT', label: '방문 인증' },
  { value: 'RANK', label: '랭킹' },
  { value: 'POINT', label: '먹포인트' },
  { value: 'ACCOUNT', label: '계정' },
];

export type AdminFaq = {
  faqId: number;
  category: FaqCategory;
  question: string;
  answer: string;
  sortOrder: number;
  status: Visibility;
};
export type FaqInput = {
  category: FaqCategory;
  question: string;
  answer: string;
  sortOrder: number;
};

/** ADMIN-18 FAQ 목록 (숨긴 FAQ 포함, 유형·순서대로) */
export const getAdminFaqs = (category?: FaqCategory) =>
  api.get<{ items: AdminFaq[] }>('/admin/faqs', { category });

/** ADMIN-12 FAQ 등록 */
export const createFaq = (body: FaqInput) => api.post<unknown>('/admin/faqs', body);

/** ADMIN-13 FAQ 고치기·숨기기 (보낸 항목만) */
export const updateFaq = (faqId: number, body: Partial<FaqInput> & { status?: Visibility }) =>
  api.patch<unknown>(`/admin/faqs/${faqId}`, body);

/** ADMIN-14 약관 새 버전 (올린 버전은 고칠 수 없다. 같은 버전 이름은 409 POLICY_VERSION_EXISTS) */
export const createPolicyDocument = (body: {
  type: TermsType;
  version: string;
  content: string;
  effectiveDate: string;
}) => api.post<unknown>('/admin/policy-documents', body);

export type AdminMemberStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN';
export type AdminMember = {
  userId: number;
  nickname: string | null;
  status: AdminMemberStatus;
  role: 'ADMIN' | 'USER';
  trustTemp: number;
  pendingReportCount: number;
  regDate: string;
  lastLoginAt: string | null;
  withdrawnAt: string | null;
  /** 탈퇴하고 3일이 지나도 사진 폴더를 다 못 지웠다 (서버가 매일 다시 지운다) */
  photoPurgePending: boolean;
};

/** ADMIN-15 회원 찾기 (최근 가입 순) */
export const getMembers = (query: {
  nickname?: string;
  status?: AdminMemberStatus;
  photoPurgePending?: boolean;
  page?: number;
  size?: number;
}) => api.get<Page<AdminMember>>('/admin/members', query);

/** ADMIN-16 이용 정지·해제 (신뢰 온도는 바꾸지 않는다) */
export const changeMemberStatus = (userId: number, status: 'ACTIVE' | 'SUSPENDED') =>
  api.patch<{ userId: number; status: 'ACTIVE' | 'SUSPENDED' }>(`/admin/members/${userId}/status`, {
    status,
  });
