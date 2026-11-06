import { Router } from 'express';
import type { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { validate } from '../../common/middlewares/validate';
import { ok } from '../../common/response';
import {
  type MukjjangMapQuery,
  mukjjangMapQuery,
  type RepresentativeTitleBody,
  representativeTitleBody,
  type SeasonQuery,
  seasonQuery,
  type SigunguDetailQuery,
  sigunguDetailQuery,
  sigunguParams,
} from './ranking.schema';
import {
  getAchievements,
  getCurrentSeason,
  getMukjjangMap,
  getMySigunguConquests,
  getMySigunguDetail,
  getRegionBackgrounds,
  getSeasonRecords,
  getSigunguRanking,
  getTitles,
  listSeasons,
  setRepresentativeTitle,
} from './ranking.service';

type SigunguParams = z.infer<typeof sigunguParams>;

/** /api/v1/seasons — RANK-01·02 */
export const seasonRouter = Router();

seasonRouter.get('/current', requireAuth(), async (_req, res) => {
  ok(res, await getCurrentSeason(), '현재 시즌을 조회했어요.');
});

seasonRouter.get('/', requireAuth(), async (_req, res) => {
  ok(res, await listSeasons(), '시즌 목록을 조회했어요.');
});

/** /api/v1/rankings — RANK-05·06 */
export const rankingRouter = Router();

rankingRouter.get(
  '/sigungus/:sigunguId',
  requireAuth(),
  validate({ params: sigunguParams, query: seasonQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { sigunguId } = req.params as unknown as SigunguParams;
    const data = await getSigunguRanking(userId, sigunguId, req.query);
    ok(res, data, '구 랭킹을 조회했어요.');
  },
);

rankingRouter.get(
  '/mukjjang-map',
  requireAuth(),
  validate({ query: mukjjangMapQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    ok(
      res,
      await getMukjjangMap(userId, req.query as unknown as MukjjangMapQuery),
      '먹짱 지도를 조회했어요.',
    );
  },
);

/** /api/v1/users/me — RANK-03·04·07·08·09·10·11 */
export const myRankingRouter = Router();

myRankingRouter.get(
  '/me/conquests/sigungus',
  requireAuth(),
  validate({ query: seasonQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    ok(
      res,
      await getMySigunguConquests(userId, req.query as unknown as SeasonQuery),
      '구별 정복 현황을 조회했어요.',
    );
  },
);

myRankingRouter.get(
  '/me/conquests/sigungus/:sigunguId',
  requireAuth(),
  validate({ params: sigunguParams, query: sigunguDetailQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { sigunguId } = req.params as unknown as SigunguParams;
    const data = await getMySigunguDetail(
      userId,
      sigunguId,
      req.query as unknown as SigunguDetailQuery,
    );
    ok(res, data, '구 현황을 조회했어요.');
  },
);

myRankingRouter.get('/me/region-backgrounds', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getRegionBackgrounds(userId), '구 배경 현황을 조회했어요.');
});

myRankingRouter.get('/me/achievements', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getAchievements(userId), '업적을 조회했어요.');
});

myRankingRouter.patch(
  '/me/representative-title',
  requireAuth(),
  validate({ body: representativeTitleBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    ok(
      res,
      await setRepresentativeTitle(userId, req.body as RepresentativeTitleBody),
      '대표 칭호를 바꿨어요.',
    );
  },
);

myRankingRouter.get('/me/season-records', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getSeasonRecords(userId), '시즌 기록을 조회했어요.');
});

myRankingRouter.get('/me/titles', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getTitles(userId), '칭호를 조회했어요.');
});
