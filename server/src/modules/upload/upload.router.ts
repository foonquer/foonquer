import { Router } from 'express';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { rateLimit } from '../../common/middlewares/rate-limit';
import { validate } from '../../common/middlewares/validate';
import { ok } from '../../common/response';
import { uploadUrlBody, type UploadUrlBody } from './upload.schema';
import { issueUploadUrl } from './upload.service';

export const uploadRouter = Router();

/** UPLOAD-01 사진 업로드 URL 발급 (리뷰·영수증·현장·문의) */
uploadRouter.post(
  '/signed-url',
  requireAuth(),
  rateLimit({ windowMs: 60_000, limit: 20 }),
  validate({ body: uploadUrlBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const data = await issueUploadUrl(userId, req.body as UploadUrlBody);
    ok(res, data, '업로드 URL을 발급했어요.');
  },
);
