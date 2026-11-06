import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { pageQuery, toPageResult } from '../../common/pagination';
import { formatDbDate, kstTodayAsDbDate, toKstIso, toKstIsoOrNull } from '../../common/time';
import { prisma } from '../../lib/prisma';
import { createReadUrl } from '../../lib/storage';
import { assertUploadedImage } from '../upload/uploaded-image';
import { SupportError } from './support.errors';

// CS-01~07 공지·FAQ·1:1 문의·약관 (ERD notice, faq, inquiry, policy_document). 문의 답변은 앱 알림으로만 알린다(이메일 없음)

export const noticeListQuery = z.object({ ...pageQuery });
export const noticeParams = z.object({ noticeId: z.coerce.number().int().positive() });
export const faqQuery = z.object({
  category: z
    .enum(['VISIT', 'RANK', 'POINT', 'ACCOUNT'], { error: 'INVALID_FAQ_CATEGORY' })
    .optional(),
});
export const inquiryBody = z.object({
  category: z.enum(['VISIT', 'ACCOUNT', 'REPORT', 'ETC'], { error: 'INVALID_INQUIRY_CATEGORY' }),
  content: z
    .string({ error: 'INQUIRY_CONTENT_REQUIRED' })
    .trim()
    .min(1, { error: 'INQUIRY_CONTENT_REQUIRED' })
    .max(1000, { error: 'INQUIRY_CONTENT_REQUIRED' }),
  refVisitId: z.number().int().positive().nullable().optional(),
  imageKey: z.string().min(1).max(255).nullable().optional(),
});
export type InquiryBody = z.infer<typeof inquiryBody>;
export const inquiryListQuery = z.object({ ...pageQuery });
export const inquiryParams = z.object({ inquiryId: z.coerce.number().int().positive() });
export const termsParams = z.object({
  termsType: z.enum(['TERMS', 'PRIVACY', 'LOCATION'], { error: 'TERMS_NOT_FOUND' }),
});
export const termsQuery = z.object({ version: z.string().max(20).optional() });

const STATUS_API: Record<string, string> = { W: 'WAITING', D: 'ANSWERED' };

/** CS-01 공지사항 목록 (필독 고정 먼저, 최신순) */
export async function listNotices(query: z.infer<typeof noticeListQuery>) {
  const where = { status: 'A' };
  const [rows, totalCount] = await Promise.all([
    prisma.notice.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { regDate: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.size,
      take: query.size,
      select: { id: true, title: true, tag: true, isPinned: true, regDate: true },
    }),
    prisma.notice.count({ where }),
  ]);
  const items = rows.map((n) => ({
    noticeId: n.id,
    title: n.title,
    tag: n.tag,
    isPinned: n.isPinned,
    regDate: toKstIso(n.regDate),
  }));
  return toPageResult(items, { ...query, totalCount });
}

/** CS-02 공지사항 상세 */
export async function getNotice(noticeId: number) {
  const n = await prisma.notice.findUnique({ where: { id: noticeId } });
  if (!n || n.status !== 'A') throw new AppError(SupportError.NOTICE_NOT_FOUND);
  return {
    noticeId: n.id,
    title: n.title,
    content: n.content,
    tag: n.tag,
    isPinned: n.isPinned,
    regDate: toKstIso(n.regDate),
    updatedAt: toKstIsoOrNull(n.updateDate),
  };
}

/** CS-03 FAQ (유형별) */
export async function listFaqs(category?: string) {
  const rows = await prisma.faq.findMany({
    where: { status: 'A', category },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  });
  return {
    items: rows.map((f) => ({
      faqId: f.id,
      category: f.category,
      question: f.question,
      answer: f.answer,
    })),
  };
}

/** CS-04 1:1 문의 등록 (사진 1장, 방문 인증 문의는 내 인증 내역을 붙일 수 있다) */
export async function createInquiry(userId: bigint, body: InquiryBody, now = new Date()) {
  if (body.refVisitId) {
    const visit = await prisma.visit.findUnique({
      where: { id: BigInt(body.refVisitId) },
      select: { userId: true },
    });
    if (!visit || visit.userId !== userId) throw new AppError(SupportError.INVALID_REF_VISIT);
  }
  if (body.imageKey) await assertUploadedImage(userId, 'INQUIRY', body.imageKey);
  const inquiry = await prisma.inquiry.create({
    data: {
      userId,
      category: body.category,
      content: body.content,
      refVisitId: body.refVisitId ? BigInt(body.refVisitId) : null,
      imageKey: body.imageKey ?? null,
      regDate: now,
    },
  });
  return { inquiryId: inquiry.id, status: STATUS_API.W };
}

/** CS-05 내 문의 목록 */
export async function listMyInquiries(userId: bigint, query: z.infer<typeof inquiryListQuery>) {
  const where = { userId };
  const [rows, totalCount] = await Promise.all([
    prisma.inquiry.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    }),
    prisma.inquiry.count({ where }),
  ]);
  const items = rows.map((i) => ({
    inquiryId: i.id,
    category: i.category,
    contentPreview: i.content.slice(0, 50),
    status: STATUS_API[i.status] ?? i.status,
    regDate: toKstIso(i.regDate),
    answeredAt: toKstIsoOrNull(i.answeredAt),
  }));
  return toPageResult(items, { ...query, totalCount });
}

/** CS-06 문의 상세 (사진은 10분짜리 signed URL) */
export async function getInquiry(userId: bigint, inquiryId: number) {
  const i = await prisma.inquiry.findUnique({
    where: { id: BigInt(inquiryId) },
    include: {
      refVisit: {
        select: { id: true, status: true, regDate: true, restaurant: { select: { name: true } } },
      },
    },
  });
  if (!i || i.userId !== userId) throw new AppError(SupportError.INQUIRY_NOT_FOUND);
  return {
    inquiryId: i.id,
    category: i.category,
    content: i.content,
    imageUrl: await createReadUrl(i.imageKey, 600),
    refVisit: i.refVisit
      ? {
          verificationId: i.refVisit.id,
          restaurantName: i.refVisit.restaurant?.name ?? null,
          regDate: toKstIso(i.refVisit.regDate),
        }
      : null,
    status: STATUS_API[i.status] ?? i.status,
    answer: i.answer,
    answeredAt: toKstIsoOrNull(i.answeredAt),
    regDate: toKstIso(i.regDate),
  };
}

/** CS-07 약관 (로그인 없이). version이 없으면 오늘 시행 중인 최신 버전 */
export async function getTerms(type: string, version: string | undefined, now = new Date()) {
  const today = kstTodayAsDbDate(now);
  const [doc, versions] = await Promise.all([
    version
      ? prisma.policyDocument.findUnique({ where: { type_version: { type, version } } })
      : prisma.policyDocument.findFirst({
          where: { type, effectiveDate: { lte: today } },
          orderBy: { effectiveDate: 'desc' },
        }),
    prisma.policyDocument.findMany({
      where: { type },
      orderBy: { effectiveDate: 'desc' },
      select: { version: true, effectiveDate: true },
    }),
  ]);
  if (!doc) throw new AppError(SupportError.TERMS_NOT_FOUND);
  return {
    type: doc.type,
    version: doc.version,
    effectiveDate: formatDbDate(doc.effectiveDate),
    content: doc.content,
    versions: versions.map((v) => ({
      version: v.version,
      effectiveDate: formatDbDate(v.effectiveDate),
    })),
  };
}
