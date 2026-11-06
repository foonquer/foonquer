import { Router } from 'express';
import type { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { rateLimit } from '../../common/middlewares/rate-limit';
import { validate } from '../../common/middlewares/validate';
import { created, ok } from '../../common/response';
import { consentsBody } from '../auth/auth.schema';
import { saveMemberConsents } from '../auth/consent.service';
import { clearRefreshCookie } from '../auth/refresh-token';
import { addLocalRegion, getLocalRegions, removeLocalRegion } from './local-region.service';
import {
  changeProfileImage,
  issueProfileImageUploadUrl,
  removeProfileImage,
} from './profile-image.service';
import { getSettings, updateNotificationSettings } from './settings.service';
import { getTasteWeights, updateTasteWeights } from './taste-weights';
import {
  localRegionAddBody,
  localRegionParams,
  nicknameAvailabilityQuery,
  notificationSettingsBody,
  profileImageBody,
  profileImageUploadBody,
  profileSetupBody,
  profileUpdateBody,
  type TasteWeightsBody,
  tasteWeightsBody,
  withdrawalBody,
} from './user.schema';
import {
  checkNicknameAvailability,
  completeProfile,
  getMyProfile,
  updateMyProfile,
} from './user.service';
import { getWithdrawalSummary, withdrawMember } from './withdrawal.service';

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

// USER-02 프로필 사진 업로드 URL 발급 (프로필 설정 전 회원도 부른다)
userRouter.post(
  '/me/profile-image/upload-url',
  requireAuth('profile'),
  rateLimit({ windowMs: 60_000, limit: 10 }),
  validate({ body: profileImageUploadBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const body = req.body as z.infer<typeof profileImageUploadBody>;
    ok(res, await issueProfileImageUploadUrl(userId, body), '업로드 URL을 발급했어요.');
  },
);

// USER-06 프로필 사진 변경
userRouter.put(
  '/me/profile-image',
  requireAuth(),
  validate({ body: profileImageBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { imageKey } = req.body as z.infer<typeof profileImageBody>;
    ok(res, await changeProfileImage(userId, imageKey), '프로필 사진을 바꿨어요.');
  },
);

// USER-07 프로필 사진 삭제 (기본 캐릭터로)
userRouter.delete('/me/profile-image', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await removeProfileImage(userId), '기본 캐릭터로 바꿨어요.');
});

// SET-01 설정 조회
userRouter.get('/me/settings', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getSettings(userId), '설정을 조회했어요.');
});

// SET-02 알림 설정 변경
userRouter.patch(
  '/me/notification-settings',
  requireAuth(),
  validate(
    { body: notificationSettingsBody },
    { validationMessage: '알림 값은 true/false로 보내 주세요.' },
  ),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const body = req.body as z.infer<typeof notificationSettingsBody>;
    const { data, message } = await updateNotificationSettings(userId, body);
    ok(res, data, message);
  },
);

// USER-09 내 취향 조회
userRouter.get('/me/taste-weights', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getTasteWeights(userId), '내 취향을 조회했어요.');
});

// USER-10 내 취향 저장
userRouter.put(
  '/me/taste-weights',
  requireAuth(),
  validate({ body: tasteWeightsBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const data = await updateTasteWeights(userId, req.body as TasteWeightsBody);
    ok(res, data, '내 취향을 저장했어요. 내 종합 별점에 바로 반영돼요.');
  },
);

// SET-03 탈퇴 전 안내 조회
userRouter.get('/me/withdrawal-summary', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getWithdrawalSummary(userId), '탈퇴 안내를 조회했어요.');
});

// SET-04 회원 탈퇴 (성공하면 refreshToken 쿠키도 지운다)
userRouter.delete('/me', requireAuth(), validate({ body: withdrawalBody }), async (req, res) => {
  const { userId } = getAuthUser(req);
  const data = await withdrawMember(userId, req.body as z.infer<typeof withdrawalBody>);
  clearRefreshCookie(res);
  ok(res, data, '탈퇴했어요. 그동안 함께해 주셔서 고마워요.');
});
