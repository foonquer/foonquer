import { Router } from 'express';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { validate } from '../../common/middlewares/validate';
import { ok } from '../../common/response';
import { type MapRestaurantsQuery, mapRestaurantsQuery } from './map.schema';
import { getMapRestaurants } from './map.service';

/** /api/v1/map */
export const mapRouter = Router();

// MAP-01 지도 영역 음식점 조회
mapRouter.get(
  '/restaurants',
  requireAuth(),
  validate({ query: mapRestaurantsQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const query = req.query as unknown as MapRestaurantsQuery;
    ok(res, await getMapRestaurants(userId, query), '지도 음식점을 조회했어요.');
  },
);
