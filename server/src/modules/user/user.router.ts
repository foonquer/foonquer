import { Router } from 'express';
import type { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { validate } from '../../common/middlewares/validate';
import { ok } from '../../common/response';
import { consentsBody, passwordChangeBody } from '../auth/auth.schema';
import { saveMemberConsents } from '../auth/consent.service';
import { changePassword } from '../auth/password.service';
import { setRefreshCookie } from '../auth/refresh-token';

/** /api/v1/users */
export const userRouter = Router();

// AUTH-15 약관 동의 저장 (소셜 가입자). 약관 동의 전 회원(status P)도 부른다.
userRouter.post(
  '/me/consents',
  requireAuth('terms'),
  validate({ body: consentsBody }, { validationMessage: '동의 항목을 모두 보내 주세요.' }),
  async (req, res) => {
    const { userId, status } = getAuthUser(req);
    const data = await saveMemberConsents(userId, status, req.body as z.infer<typeof consentsBody>);
    ok(res, data, '약관 동의를 저장했어요.');
  },
);

// SET-05 비밀번호 변경
userRouter.patch(
  '/me/password',
  requireAuth(),
  validate({ body: passwordChangeBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { currentPassword, newPassword } = req.body as z.infer<typeof passwordChangeBody>;
    const { refreshToken, data } = await changePassword(userId, { currentPassword, newPassword });
    setRefreshCookie(res, refreshToken);
    ok(res, data, '비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해 주세요.');
  },
);
