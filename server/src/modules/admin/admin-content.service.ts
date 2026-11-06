import { isUniqueViolation } from '../../common/db';
import { AppError } from '../../common/errors/app-error';
import { toPageResult } from '../../common/pagination';
import { formatDbDate, toKstIso, toKstIsoOrNull } from '../../common/time';
import { prisma } from '../../lib/prisma';
import { createReadUrl } from '../../lib/storage';
import { notify } from '../notification/notify';
import { SupportError } from '../support/support.errors';
import { AdminError } from './admin.errors';
import type {
  FaqBody,
  FaqUpdateBody,
  InquiryAnswerBody,
  InquiryListQuery,
  NoticeBody,
  NoticeUpdateBody,
  PolicyDocumentBody,
} from './admin.schema';

// ADMIN-08~14 1:1 문의 답변, 공지·FAQ, 약관 새 버전

const VISIBILITY = { VISIBLE: 'A', HIDDEN: 'H' } as const;
const visibilityApi = (status: string) => (status === 'A' ? 'VISIBLE' : 'HIDDEN');

function assertSomeField(body: object) {
  if (Object.values(body).every((v) => v === undefined))
    throw new AppError(AdminError.NO_FIELDS_TO_UPDATE);
}

/** ADMIN-08 문의 목록 (오래된 순, 사진은 10분짜리 signed URL) */
export async function listInquiries(query: InquiryListQuery) {
  const where = { status: query.status === 'WAITING' ? 'W' : 'D' };
  const [rows, totalCount] = await Promise.all([
    prisma.inquiry.findMany({
      where,
      orderBy: { id: 'asc' },
      skip: (query.page - 1) * query.size,
      take: query.size,
      include: { user: { select: { id: true, nickname: true } } },
    }),
    prisma.inquiry.count({ where }),
  ]);
  const items = await Promise.all(
    rows.map(async (i) => ({
      inquiryId: i.id,
      category: i.category,
      content: i.content,
      imageUrl: await createReadUrl(i.imageKey, 600),
      refVisitId: i.refVisitId,
      user: { userId: i.user.id, nickname: i.user.nickname },
      status: i.status === 'W' ? 'WAITING' : 'ANSWERED',
      answer: i.answer,
      regDate: toKstIso(i.regDate),
      answeredAt: toKstIsoOrNull(i.answeredAt),
    })),
  );
  return toPageResult(items, { ...query, totalCount });
}

/** ADMIN-09 문의 답변 (고쳐 쓸 수 있다). 처음 답할 때만 INQUIRY_ANSWER 알림 */
export async function answerInquiry(inquiryId: number, body: InquiryAnswerBody, now = new Date()) {
  const id = BigInt(inquiryId);
  return prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ user_id: bigint; status: string }[]>`
      SELECT user_id, status FROM inquiry WHERE id = ${id} FOR UPDATE`;
    if (!locked) throw new AppError(SupportError.INQUIRY_NOT_FOUND);
    await tx.inquiry.update({
      where: { id },
      data: { status: 'D', answer: body.answer, answeredAt: now },
    });
    const notified = locked.status === 'W';
    if (notified) {
      await notify(
        tx,
        locked.user_id,
        {
          category: 'NOTICE',
          type: 'INQUIRY_ANSWER',
          title: '1:1 문의에 답변이 왔어요',
          content: body.answer,
          refType: 'INQUIRY',
          refId: id,
        },
        now,
      );
    }
    return { inquiryId: id, status: 'ANSWERED', answeredAt: toKstIso(now), notified };
  });
}

function toNotice(n: {
  id: number;
  title: string;
  tag: string | null;
  isPinned: boolean;
  status: string;
  regDate: Date;
}) {
  return {
    noticeId: n.id,
    title: n.title,
    tag: n.tag,
    isPinned: n.isPinned,
    status: visibilityApi(n.status),
    regDate: toKstIso(n.regDate),
  };
}

/** ADMIN-10 공지 등록 */
export async function createNotice(body: NoticeBody, now = new Date()) {
  const notice = await prisma.notice.create({
    data: {
      title: body.title,
      content: body.content,
      tag: body.tag ?? null,
      isPinned: body.isPinned ?? false,
      regDate: now,
    },
  });
  return toNotice(notice);
}

/** ADMIN-11 공지 수정·숨기기 (보낸 항목만) */
export async function updateNotice(noticeId: number, body: NoticeUpdateBody) {
  assertSomeField(body);
  const { status, ...rest } = body;
  const { count } = await prisma.notice.updateMany({
    where: { id: noticeId },
    data: { ...rest, status: status ? VISIBILITY[status] : undefined },
  });
  if (count === 0) throw new AppError(SupportError.NOTICE_NOT_FOUND);
  return toNotice(await prisma.notice.findUniqueOrThrow({ where: { id: noticeId } }));
}

function toFaq(f: {
  id: number;
  category: string;
  question: string;
  answer: string;
  sortOrder: number;
  status: string;
}) {
  return {
    faqId: f.id,
    category: f.category,
    question: f.question,
    answer: f.answer,
    sortOrder: f.sortOrder,
    status: visibilityApi(f.status),
  };
}

/** ADMIN-12 FAQ 등록 */
export async function createFaq(body: FaqBody) {
  return toFaq(await prisma.faq.create({ data: { ...body, sortOrder: body.sortOrder ?? 0 } }));
}

/** ADMIN-13 FAQ 수정·숨기기 (보낸 항목만) */
export async function updateFaq(faqId: number, body: FaqUpdateBody) {
  assertSomeField(body);
  const { status, ...rest } = body;
  const { count } = await prisma.faq.updateMany({
    where: { id: faqId },
    data: { ...rest, status: status ? VISIBILITY[status] : undefined },
  });
  if (count === 0) throw new AppError(AdminError.FAQ_NOT_FOUND);
  return toFaq(await prisma.faq.findUniqueOrThrow({ where: { id: faqId } }));
}

/** ADMIN-14 약관 새 버전 — 시행일이 되면 CS-07·가입 동의가 이 버전을 쓴다 */
export async function createPolicyDocument(body: PolicyDocumentBody, now = new Date()) {
  try {
    const doc = await prisma.policyDocument.create({
      data: {
        type: body.type,
        version: body.version,
        content: body.content,
        effectiveDate: new Date(`${body.effectiveDate}T00:00:00Z`),
        regDate: now,
      },
    });
    return {
      policyDocumentId: doc.id,
      type: doc.type,
      version: doc.version,
      effectiveDate: formatDbDate(doc.effectiveDate),
    };
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(AdminError.POLICY_VERSION_EXISTS);
    throw err;
  }
}
