import { z } from 'zod';
import { pageQuery } from '../../common/pagination';

const id = z.coerce.number().int().positive();
const text = (max: number) => z.string().trim().min(1).max(max);
const visibility = z.enum(['VISIBLE', 'HIDDEN']);

/** ADMIN-01 */
export const reportListQuery = z.object({
  ...pageQuery,
  status: z.enum(['PENDING', 'DONE', 'REJECTED']).default('PENDING'),
  targetType: z.enum(['REVIEW', 'MEMBER']).optional(),
});
export type ReportListQuery = z.infer<typeof reportListQuery>;
export const reportParams = z.object({ reportId: id });
/** ADMIN-02 — 리뷰 신고: HIDE_REVIEW(블라인드) / FAKE_REVIEW(허위 판정), 회원 신고: SUSPEND_MEMBER, 공통: REJECT(반려) */
export const reportActionBody = z.object({
  action: z.enum(['HIDE_REVIEW', 'FAKE_REVIEW', 'SUSPEND_MEMBER', 'REJECT'], {
    error: 'INVALID_REPORT_ACTION',
  }),
});
export type ReportActionBody = z.infer<typeof reportActionBody>;

/** ADMIN-03 — adSuspected=true면 AI가 협찬·이벤트 문구를 찾은 리뷰(마패 확인 목록) */
export const reviewListQuery = z.object({
  ...pageQuery,
  status: z.enum(['VISIBLE', 'HIDDEN', 'FAKE']).optional(),
  adSuspected: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type ReviewListQuery = z.infer<typeof reviewListQuery>;
export const reviewParams = z.object({ reviewId: id });
/** ADMIN-04 */
export const reviewStatusBody = z.object({ status: z.enum(['VISIBLE', 'HIDDEN', 'FAKE']) });
export type ReviewStatusBody = z.infer<typeof reviewStatusBody>;

/** ADMIN-05 */
export const mapaeListQuery = z.object({
  ...pageQuery,
  status: z.enum(['ACTIVE', 'RELEASED']).default('ACTIVE'),
});
export type MapaeListQuery = z.infer<typeof mapaeListQuery>;
/** ADMIN-06 — AD 뒷광고 / EVENT 리뷰 이벤트 */
export const mapaeBody = z.object({
  restaurantId: z.number().int().positive(),
  reason: z.enum(['AD', 'EVENT']),
  evidence: text(500).optional(),
  reportId: z.number().int().positive().optional(),
  reviewId: z.number().int().positive().optional(),
});
export type MapaeBody = z.infer<typeof mapaeBody>;
export const mapaeParams = z.object({ mapaeId: id });
/** ADMIN-07 */
export const mapaeReleaseBody = z.object({ releaseReason: text(255) });
export type MapaeReleaseBody = z.infer<typeof mapaeReleaseBody>;

/** ADMIN-08 */
export const inquiryListQuery = z.object({
  ...pageQuery,
  status: z.enum(['WAITING', 'ANSWERED']).default('WAITING'),
});
export type InquiryListQuery = z.infer<typeof inquiryListQuery>;
export const inquiryParams = z.object({ inquiryId: id });
/** ADMIN-09 */
export const inquiryAnswerBody = z.object({ answer: text(1000) });
export type InquiryAnswerBody = z.infer<typeof inquiryAnswerBody>;

/** ADMIN-10·11 */
export const noticeBody = z.object({
  title: text(100),
  content: z.string().trim().min(1),
  tag: z.string().trim().max(10).nullable().optional(),
  isPinned: z.boolean().optional(),
});
export type NoticeBody = z.infer<typeof noticeBody>;
export const noticeUpdateBody = noticeBody.partial().extend({ status: visibility.optional() });
export type NoticeUpdateBody = z.infer<typeof noticeUpdateBody>;
export const noticeParams = z.object({ noticeId: id });

/** ADMIN-12·13 */
export const faqBody = z.object({
  category: z.enum(['VISIT', 'RANK', 'POINT', 'ACCOUNT'], { error: 'INVALID_FAQ_CATEGORY' }),
  question: text(100),
  answer: z.string().trim().min(1),
  sortOrder: z.number().int().min(0).optional(),
});
export type FaqBody = z.infer<typeof faqBody>;
export const faqUpdateBody = faqBody.partial().extend({ status: visibility.optional() });
export type FaqUpdateBody = z.infer<typeof faqUpdateBody>;
export const faqParams = z.object({ faqId: id });

/** ADMIN-14 — 새 버전을 올린다 (고치지 않는다: 동의 기록이 버전을 가리킨다) */
export const policyDocumentBody = z.object({
  type: z.enum(['TERMS', 'PRIVACY', 'LOCATION']),
  version: text(20),
  content: z.string().trim().min(1),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((d) => {
      const date = new Date(`${d}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(d);
    }),
});
export type PolicyDocumentBody = z.infer<typeof policyDocumentBody>;

/** ADMIN-15 */
export const memberListQuery = z.object({
  ...pageQuery,
  nickname: z.string().trim().min(1).max(10).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'WITHDRAWN']).optional(),
});
export type MemberListQuery = z.infer<typeof memberListQuery>;
export const memberParams = z.object({ userId: id });
/** ADMIN-16 */
export const memberStatusBody = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) });
export type MemberStatusBody = z.infer<typeof memberStatusBody>;
