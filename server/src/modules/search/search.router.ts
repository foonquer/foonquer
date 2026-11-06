import { Router } from 'express';
import type { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { validate } from '../../common/middlewares/validate';
import { ok } from '../../common/response';
import { type RecommendationQuery, recommendationQuery, searchHomeQuery } from './search.schema';
import { getRecommendations, getSearchHome } from './search.service';

/** /api/v1/search */
export const searchRouter = Router();

// SEARCH-01 검색 홈
searchRouter.get('/home', requireAuth(), validate({ query: searchHomeQuery }), async (req, res) => {
  const { userId } = getAuthUser(req);
  const { regionId } = req.query as unknown as z.infer<typeof searchHomeQuery>;
  ok(res, await getSearchHome(userId, regionId), '검색 홈을 조회했어요.');
});

/** /api/v1/recommendations */
export const recommendationRouter = Router();

// RECO-01 추천 맛집 목록
recommendationRouter.get(
  '/',
  requireAuth(),
  validate({ query: recommendationQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const query = req.query as unknown as RecommendationQuery;
    ok(res, await getRecommendations(userId, query), '추천 맛집을 조회했어요.');
  },
);
