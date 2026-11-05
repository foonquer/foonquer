import { Router } from 'express';
import type { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { rateLimit } from '../../common/middlewares/rate-limit';
import { validate } from '../../common/middlewares/validate';
import { created, ok } from '../../common/response';
import {
  type LocationCheckBody,
  locationCheckBody,
  type OnSiteBody,
  onSiteBody,
  type ReceiptBody,
  receiptBody,
  verificationParams,
} from './visit.schema';
import {
  checkLocation,
  completeOnSite,
  getVerification,
  scheduleReceiptCheck,
  submitReceipt,
} from './visit.service';

type Params = z.infer<typeof verificationParams>;

/** /api/v1/visit-verifications */
export const visitRouter = Router();

const verifyLimit = rateLimit({ windowMs: 60_000, limit: 20 });

// VISIT-01 현장 위치 확인
visitRouter.post(
  '/location-checks',
  requireAuth(),
  verifyLimit,
  validate({ body: locationCheckBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const data = await checkLocation(userId, req.body as LocationCheckBody);
    created(res, data, '가게 근처에 있어요. 음식 사진을 골라 주세요.');
  },
);

// VISIT-02 현장 사진 인증
visitRouter.post(
  '/:verificationId/on-site',
  requireAuth(),
  verifyLimit,
  validate({ params: verificationParams, body: onSiteBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { verificationId } = req.params as unknown as Params;
    const data = await completeOnSite(userId, verificationId, req.body as OnSiteBody);
    ok(res, data, '방문 인증을 마쳤어요! 별점을 남기면 정복이 끝나요.');
  },
);

// VISIT-03 영수증 인증 요청 (결과는 VISIT-04로 확인)
visitRouter.post(
  '/receipt',
  requireAuth(),
  verifyLimit,
  validate({ body: receiptBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const data = await submitReceipt(userId, req.body as ReceiptBody);
    scheduleReceiptCheck(data.verificationId);
    ok(res, data, '영수증을 읽고 있어요.', 202);
  },
);

// VISIT-04 방문 인증 결과 조회
visitRouter.get(
  '/:verificationId',
  requireAuth(),
  validate({ params: verificationParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { verificationId } = req.params as unknown as Params;
    ok(res, await getVerification(userId, verificationId), '방문 인증 결과를 조회했어요.');
  },
);
