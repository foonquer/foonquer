import { Router } from 'express';
import type { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { rateLimit } from '../../common/middlewares/rate-limit';
import { validate } from '../../common/middlewares/validate';
import { created, ok } from '../../common/response';
import {
  createInquiry,
  faqQuery,
  getInquiry,
  getNotice,
  getTerms,
  type InquiryBody,
  inquiryBody,
  inquiryListQuery,
  inquiryParams,
  listFaqs,
  listMyInquiries,
  listNotices,
  noticeListQuery,
  noticeParams,
  termsParams,
  termsQuery,
} from './support.service';

/** /api/v1/notices — CS-01·02 */
export const noticeRouter = Router();

noticeRouter.get('/', requireAuth(), validate({ query: noticeListQuery }), async (req, res) => {
  ok(
    res,
    await listNotices(req.query as unknown as z.infer<typeof noticeListQuery>),
    '공지사항을 조회했어요.',
  );
});

noticeRouter.get(
  '/:noticeId',
  requireAuth(),
  validate({ params: noticeParams }),
  async (req, res) => {
    const { noticeId } = req.params as unknown as z.infer<typeof noticeParams>;
    ok(res, await getNotice(noticeId), '공지사항을 조회했어요.');
  },
);

/** /api/v1/faqs — CS-03 */
export const faqRouter = Router();

faqRouter.get('/', requireAuth(), validate({ query: faqQuery }), async (req, res) => {
  const { category } = req.query as unknown as z.infer<typeof faqQuery>;
  ok(res, await listFaqs(category), '자주 묻는 질문을 조회했어요.');
});

/** /api/v1/inquiries — CS-04·05·06 */
export const inquiryRouter = Router();

inquiryRouter.post(
  '/',
  requireAuth(),
  rateLimit({ windowMs: 60_000, limit: 5 }),
  validate({ body: inquiryBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    created(
      res,
      await createInquiry(userId, req.body as InquiryBody),
      '문의를 보냈어요. 답변은 알림으로 알려 드려요.',
    );
  },
);

inquiryRouter.get('/me', requireAuth(), validate({ query: inquiryListQuery }), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(
    res,
    await listMyInquiries(userId, req.query as unknown as z.infer<typeof inquiryListQuery>),
    '내 문의를 조회했어요.',
  );
});

inquiryRouter.get(
  '/:inquiryId',
  requireAuth(),
  validate({ params: inquiryParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { inquiryId } = req.params as unknown as z.infer<typeof inquiryParams>;
    ok(res, await getInquiry(userId, inquiryId), '문의를 조회했어요.');
  },
);

/** /api/v1/terms — CS-07 (로그인 없이) */
export const termsRouter = Router();

termsRouter.get(
  '/:termsType',
  validate({ params: termsParams, query: termsQuery }),
  async (req, res) => {
    const { termsType } = req.params as unknown as z.infer<typeof termsParams>;
    const { version } = req.query as unknown as z.infer<typeof termsQuery>;
    ok(res, await getTerms(termsType, version), '약관을 조회했어요.');
  },
);
