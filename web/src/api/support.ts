// 공지·FAQ·1:1 문의·약관 API (CS-01~07)

import { api } from '../lib/api';
import type { ObjectionReason, OwnerRelation } from './mapae';
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

/** MAPAE(사장님 마패 이의제기)는 고객센터 폼이 아니라 가게 상세의 이의제기로만 보낸다 */
export type InquiryCategory = 'VISIT' | 'ACCOUNT' | 'REPORT' | 'ETC' | 'MAPAE';
export const INQUIRY_CATEGORIES: { value: Exclude<InquiryCategory, 'MAPAE'>; label: string }[] = [
  { value: 'VISIT', label: '방문 인증' },
  { value: 'ACCOUNT', label: '계정' },
  { value: 'REPORT', label: '신고' },
  { value: 'ETC', label: '기타' },
];

/** 문의 유형 이름 (내 문의 목록·상세) */
export const inquiryCategoryLabel = (c: InquiryCategory) =>
  c === 'MAPAE' ? '사장님 이의제기' : (INQUIRY_CATEGORIES.find((i) => i.value === c)?.label ?? c);

/** 사장님 마패 이의제기의 대상 가게·관계·사유 (다른 문의는 null) */
export type MapaeObjection = {
  restaurant: { restaurantId: number; name: string } | null;
  relation: OwnerRelation;
  reason: ObjectionReason;
};

/** CS-04 1:1 문의 (사진 1장) */
export const createInquiry = (body: {
  category: Exclude<InquiryCategory, 'MAPAE'>;
  content: string;
  imageKey?: string | null;
}) => api.post<{ inquiryId: number; status: 'WAITING' }>('/inquiries', body);

export type InquiryItem = {
  inquiryId: number;
  category: InquiryCategory;
  contentPreview: string;
  mapaeObjection: MapaeObjection | null;
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
    mapaeObjection: MapaeObjection | null;
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
