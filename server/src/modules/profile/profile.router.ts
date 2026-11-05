import { Router } from 'express';
import type { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { rateLimit } from '../../common/middlewares/rate-limit';
import { validate } from '../../common/middlewares/validate';
import { created, ok } from '../../common/response';
import {
  type BlockListQuery,
  blockListQuery,
  memberParams,
  type PickCandidateQuery,
  pickCandidateQuery,
  type PicksBody,
  picksBody,
  type ReportBody,
  reportBody,
  type VisitedQuery,
  visitedQuery,
} from './profile.schema';
import {
  getMemberProfile,
  getMyPicks,
  listVisitedRestaurants,
  saveMyPicks,
} from './profile.service';
import { blockMember, createReport, listBlocks, unblockMember } from './report-block.service';

type MemberParams = z.infer<typeof memberParams>;

/** /api/v1/users — 내 PICK·차단 목록(/me/...)과 탐방러 프로필(/:userId/...) */
export const profileRouter = Router();

// PICK-01 내 PICK
profileRouter.get(
  '/me/picks',
  requireAuth(),
  validate({ query: pickCandidateQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    ok(
      res,
      await getMyPicks(userId, req.query as unknown as PickCandidateQuery),
      '내 PICK을 조회했어요.',
    );
  },
);

// PICK-02 내 PICK 저장
profileRouter.put('/me/picks', requireAuth(), validate({ body: picksBody }), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await saveMyPicks(userId, req.body as PicksBody), '내 PICK을 저장했어요.');
});

// BLOCK-03 차단 목록
profileRouter.get(
  '/me/blocks',
  requireAuth(),
  validate({ query: blockListQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    ok(
      res,
      await listBlocks(userId, req.query as unknown as BlockListQuery),
      '차단 목록을 조회했어요.',
    );
  },
);

// BLOCK-01 차단하기
profileRouter.put(
  '/me/blocks/:userId',
  requireAuth(),
  validate({ params: memberParams }),
  async (req, res) => {
    const me = getAuthUser(req);
    const { userId } = req.params as unknown as MemberParams;
    ok(res, await blockMember(me.userId, userId), '차단했어요. 이 탐험가의 리뷰가 보이지 않아요.');
  },
);

// BLOCK-02 차단 해제
profileRouter.delete(
  '/me/blocks/:userId',
  requireAuth(),
  validate({ params: memberParams }),
  async (req, res) => {
    const me = getAuthUser(req);
    const { userId } = req.params as unknown as MemberParams;
    ok(res, await unblockMember(me.userId, userId), '차단을 풀었어요.');
  },
);

// PROFILE-01 탐방러 프로필
profileRouter.get(
  '/:userId/profile',
  requireAuth(),
  validate({ params: memberParams }),
  async (req, res) => {
    const me = getAuthUser(req);
    const { userId } = req.params as unknown as MemberParams;
    ok(res, await getMemberProfile(me.userId, userId), '탐방러 프로필을 조회했어요.');
  },
);

// PROFILE-02 다녀온 가게
profileRouter.get(
  '/:userId/visited-restaurants',
  requireAuth(),
  validate({ params: memberParams, query: visitedQuery }),
  async (req, res) => {
    const me = getAuthUser(req);
    const { userId } = req.params as unknown as MemberParams;
    const data = await listVisitedRestaurants(
      me.userId,
      userId,
      req.query as unknown as VisitedQuery,
    );
    ok(res, data, '다녀온 가게를 조회했어요.');
  },
);

/** /api/v1/reports — REPORT-01 */
export const reportRouter = Router();

reportRouter.post(
  '/',
  requireAuth(),
  rateLimit({ windowMs: 60_000, limit: 10 }),
  validate({ body: reportBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    created(
      res,
      await createReport(userId, req.body as ReportBody),
      '신고를 접수했어요. 확인 후 조치할게요.',
    );
  },
);
