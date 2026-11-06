import { type RequestHandler, Router } from 'express';
import type { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { AppError } from '../../common/errors/app-error';
import { CommonError } from '../../common/errors/error-codes';
import { validate } from '../../common/middlewares/validate';
import { created, ok } from '../../common/response';
import { prisma } from '../../lib/prisma';
import {
  answerInquiry,
  createFaq,
  createNotice,
  createPolicyDocument,
  listInquiries,
  updateFaq,
  updateNotice,
} from './admin-content.service';
import {
  changeMemberStatus,
  changeReviewStatus,
  grantMapae,
  listMapae,
  listMembers,
  listReports,
  listReviews,
  processReport,
  releaseMapae,
} from './admin-moderation.service';
import {
  type FaqBody,
  faqBody,
  faqParams,
  type FaqUpdateBody,
  faqUpdateBody,
  type InquiryAnswerBody,
  inquiryAnswerBody,
  type InquiryListQuery,
  inquiryListQuery,
  inquiryParams,
  type MapaeBody,
  mapaeBody,
  type MapaeListQuery,
  mapaeListQuery,
  mapaeParams,
  type MapaeReleaseBody,
  mapaeReleaseBody,
  type MemberListQuery,
  memberListQuery,
  memberParams,
  type MemberStatusBody,
  memberStatusBody,
  type NoticeBody,
  noticeBody,
  noticeParams,
  type NoticeUpdateBody,
  noticeUpdateBody,
  type PolicyDocumentBody,
  policyDocumentBody,
  type ReportActionBody,
  reportActionBody,
  type ReportListQuery,
  reportListQuery,
  reportParams,
  type ReviewListQuery,
  reviewListQuery,
  reviewParams,
  type ReviewStatusBody,
  reviewStatusBody,
} from './admin.schema';

/** 운영자(member.role = A)만. 역할은 토큰이 아니라 DB에서 매번 읽는다 */
const requireAdmin: RequestHandler = async (req, _res, next) => {
  const { userId } = getAuthUser(req);
  const member = await prisma.member.findUnique({ where: { id: userId }, select: { role: true } });
  if (member?.role !== 'A') throw new AppError(CommonError.FORBIDDEN);
  next();
};

const params = <T extends z.ZodType>(req: { params: unknown }) => req.params as z.infer<T>;

/** /api/v1/admin — ADMIN-01~16 */
export const adminRouter = Router();
adminRouter.use(requireAuth(), requireAdmin);

adminRouter.get('/reports', validate({ query: reportListQuery }), async (req, res) => {
  ok(res, await listReports(req.query as unknown as ReportListQuery), '신고 목록을 조회했어요.');
});

adminRouter.patch(
  '/reports/:reportId',
  validate({ params: reportParams, body: reportActionBody }),
  async (req, res) => {
    const { reportId } = params<typeof reportParams>(req);
    ok(res, await processReport(reportId, req.body as ReportActionBody), '신고를 처리했어요.');
  },
);

adminRouter.get('/reviews', validate({ query: reviewListQuery }), async (req, res) => {
  ok(res, await listReviews(req.query as unknown as ReviewListQuery), '리뷰 목록을 조회했어요.');
});

adminRouter.patch(
  '/reviews/:reviewId/status',
  validate({ params: reviewParams, body: reviewStatusBody }),
  async (req, res) => {
    const { reviewId } = params<typeof reviewParams>(req);
    ok(
      res,
      await changeReviewStatus(reviewId, req.body as ReviewStatusBody),
      '리뷰 상태를 바꿨어요.',
    );
  },
);

adminRouter.get('/mapae', validate({ query: mapaeListQuery }), async (req, res) => {
  ok(res, await listMapae(req.query as unknown as MapaeListQuery), '마패 목록을 조회했어요.');
});

adminRouter.post('/mapae', validate({ body: mapaeBody }), async (req, res) => {
  const { userId } = getAuthUser(req);
  created(res, await grantMapae(userId, req.body as MapaeBody), '마패를 붙였어요.');
});

adminRouter.patch(
  '/mapae/:mapaeId/release',
  validate({ params: mapaeParams, body: mapaeReleaseBody }),
  async (req, res) => {
    const { mapaeId } = params<typeof mapaeParams>(req);
    ok(res, await releaseMapae(mapaeId, req.body as MapaeReleaseBody), '마패를 해제했어요.');
  },
);

adminRouter.get('/inquiries', validate({ query: inquiryListQuery }), async (req, res) => {
  ok(res, await listInquiries(req.query as unknown as InquiryListQuery), '문의 목록을 조회했어요.');
});

adminRouter.patch(
  '/inquiries/:inquiryId/answer',
  validate({ params: inquiryParams, body: inquiryAnswerBody }),
  async (req, res) => {
    const { inquiryId } = params<typeof inquiryParams>(req);
    ok(res, await answerInquiry(inquiryId, req.body as InquiryAnswerBody), '답변을 저장했어요.');
  },
);

adminRouter.post('/notices', validate({ body: noticeBody }), async (req, res) => {
  created(res, await createNotice(req.body as NoticeBody), '공지를 등록했어요.');
});

adminRouter.patch(
  '/notices/:noticeId',
  validate({ params: noticeParams, body: noticeUpdateBody }),
  async (req, res) => {
    const { noticeId } = params<typeof noticeParams>(req);
    ok(res, await updateNotice(noticeId, req.body as NoticeUpdateBody), '공지를 수정했어요.');
  },
);

adminRouter.post('/faqs', validate({ body: faqBody }), async (req, res) => {
  created(res, await createFaq(req.body as FaqBody), 'FAQ를 등록했어요.');
});

adminRouter.patch(
  '/faqs/:faqId',
  validate({ params: faqParams, body: faqUpdateBody }),
  async (req, res) => {
    const { faqId } = params<typeof faqParams>(req);
    ok(res, await updateFaq(faqId, req.body as FaqUpdateBody), 'FAQ를 수정했어요.');
  },
);

adminRouter.post('/policy-documents', validate({ body: policyDocumentBody }), async (req, res) => {
  created(
    res,
    await createPolicyDocument(req.body as PolicyDocumentBody),
    '약관 새 버전을 등록했어요.',
  );
});

adminRouter.get('/members', validate({ query: memberListQuery }), async (req, res) => {
  ok(res, await listMembers(req.query as unknown as MemberListQuery), '회원 목록을 조회했어요.');
});

adminRouter.patch(
  '/members/:userId/status',
  validate({ params: memberParams, body: memberStatusBody }),
  async (req, res) => {
    const { userId: adminId } = getAuthUser(req);
    const { userId } = params<typeof memberParams>(req);
    const data = await changeMemberStatus(adminId, userId, req.body as MemberStatusBody);
    ok(res, data, data.status === 'SUSPENDED' ? '이용 정지했어요.' : '이용 정지를 풀었어요.');
  },
);
