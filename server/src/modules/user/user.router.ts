import { Router } from 'express';
import type { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { validate } from '../../common/middlewares/validate';
import { created, ok } from '../../common/response';
import { consentsBody, passwordChangeBody } from '../auth/auth.schema';
import { saveMemberConsents } from '../auth/consent.service';
import { changePassword } from '../auth/password.service';
import { setRefreshCookie } from '../auth/refresh-token';
import { addLocalRegion, getLocalRegions, removeLocalRegion } from './local-region.service';
import {
  localRegionAddBody,
  localRegionParams,
  nicknameAvailabilityQuery,
  profileSetupBody,
  profileUpdateBody,
} from './user.schema';
import {
  checkNicknameAvailability,
  completeProfile,
  getMyProfile,
  updateMyProfile,
} from './user.service';

/** /api/v1/users */
export const userRouter = Router();

// USER-01 닉네임 중복 확인 (프로필 설정 전 회원도 부른다)
userRouter.get(
  '/nickname/availability',
  requireAuth('profile'),
  validate({ query: nicknameAvailabilityQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { nickname } = req.query as unknown as z.infer<typeof nicknameAvailabilityQuery>;
    const { data, message } = await checkNicknameAvailability(userId, nickname);
    ok(res, data, message);
  },
);

// USER-04 내 프로필 조회 (약관 동의 전 회원도 부른다)
userRouter.get('/me', requireAuth('terms'), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getMyProfile(userId), '내 프로필을 조회했어요.');
});

// USER-05 프로필 수정
userRouter.patch('/me', requireAuth(), validate({ body: profileUpdateBody }), async (req, res) => {
  const { userId } = getAuthUser(req);
  const data = await updateMyProfile(userId, req.body as z.infer<typeof profileUpdateBody>);
  ok(res, data, '프로필을 저장했어요.');
});

// USER-03 프로필 설정 완료 (status P 회원)
userRouter.post(
  '/me/profile',
  requireAuth('profile'),
  validate({ body: profileSetupBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const data = await completeProfile(userId, req.body as z.infer<typeof profileSetupBody>);
    created(res, data, '프로필을 설정했어요. 첫 맛집을 찾으러 가 볼까요?');
  },
);

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

// LOCAL-01 내 동네 목록 조회
userRouter.get('/me/local-regions', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getLocalRegions(userId), '내 동네를 조회했어요.');
});

// LOCAL-02 내 동네 추가
userRouter.post(
  '/me/local-regions',
  requireAuth(),
  validate({ body: localRegionAddBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { regionId } = req.body as z.infer<typeof localRegionAddBody>;
    const { data, message } = await addLocalRegion(userId, regionId);
    created(res, data, message);
  },
);

// LOCAL-03 내 동네 삭제
userRouter.delete(
  '/me/local-regions/:localRegionId',
  requireAuth(),
  validate({ params: localRegionParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { localRegionId } = req.params as unknown as z.infer<typeof localRegionParams>;
    ok(res, await removeLocalRegion(userId, localRegionId), '내 동네에서 뺐어요.');
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
