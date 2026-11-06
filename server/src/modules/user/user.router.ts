import { Router } from 'express';
import type { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { validate } from '../../common/middlewares/validate';
import { ok } from '../../common/response';
import { passwordChangeBody } from '../auth/auth.schema';
import { changePassword } from '../auth/password.service';
import { setRefreshCookie } from '../auth/refresh-token';

/** /api/v1/users */
export const userRouter = Router();

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
