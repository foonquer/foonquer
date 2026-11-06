// 공지·FAQ·1:1 문의·약관 API (CS-01~07)

import { api } from '../lib/api';
import type { Page } from './reviews';

export type NoticeItem = {
  noticeId: number;
  title: string;
  tag: string | null;
  isPinned: boolean;
  regDate: string;
};

/** CS-01 공지사항 (필독 먼저, 최신순) */
export const getNotices = (page = 1) => api.get<Page<NoticeItem>>('/notices', { page, size: 20 });

/** CS-02 공지 상세 */
export const getNotice = (noticeId: number) =>
  api.get<NoticeItem & { content: string; updatedAt: string | null }>(`/notices/${noticeId}`);

/** CS-03 자주 묻는 질문 */
export const getFaqs = () =>
  api.get<{ items: { faqId: number; category: string; question: string; answer: string }[] }>(
    '/faqs',
  );

export type InquiryCategory = 'VISIT' | 'ACCOUNT' | 'REPORT' | 'ETC';
export const INQUIRY_CATEGORIES: { value: InquiryCategory; label: string }[] = [
  { value: 'VISIT', label: '방문 인증' },
  { value: 'ACCOUNT', label: '계정' },
  { value: 'REPORT', label: '신고' },
  { value: 'ETC', label: '기타' },
];

/** CS-04 1:1 문의 (사진 1장) */
export const createInquiry = (body: {
  category: InquiryCategory;
  content: string;
  imageKey?: string | null;
}) => api.post<{ inquiryId: number; status: 'WAITING' }>('/inquiries', body);

export type InquiryItem = {
  inquiryId: number;
  category: InquiryCategory;
  contentPreview: string;
  status: 'WAITING' | 'ANSWERED';
  regDate: string;
  answeredAt: string | null;
};

/** CS-05 내 문의 */
export const getMyInquiries = (page = 1) =>
  api.get<Page<InquiryItem>>('/inquiries/me', { page, size: 20 });

/** CS-06 문의 상세 */
export const getInquiry = (inquiryId: number) =>
  api.get<{
    inquiryId: number;
    category: InquiryCategory;
    content: string;
    imageUrl: string | null;
    refVisit: { verificationId: number; restaurantName: string | null; regDate: string } | null;
    status: 'WAITING' | 'ANSWERED';
    answer: string | null;
    answeredAt: string | null;
    regDate: string;
  }>(`/inquiries/${inquiryId}`);

export type TermsType = 'TERMS' | 'PRIVACY' | 'LOCATION';

/** CS-07 약관 (로그인 없이). version이 없으면 시행 중인 최신 */
export const getTerms = (type: TermsType, version?: string) =>
  api.get<{
    type: TermsType;
    version: string;
    effectiveDate: string;
    content: string;
    versions: { version: string; effectiveDate: string }[];
  }>(`/terms/${type}`, { version });
