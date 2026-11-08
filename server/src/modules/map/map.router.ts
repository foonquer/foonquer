import { Router } from 'express';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { validate } from '../../common/middlewares/validate';
import { rateLimit } from '../../common/middlewares/rate-limit';
import { ok } from '../../common/response';
import {
  type MapRestaurantsQuery,
  mapRestaurantsQuery,
  type NearestRestaurantQuery,
  nearestRestaurantQuery,
} from './map.schema';
import { findNearestRestaurant, getMapRestaurants } from './map.service';

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

// MAP-03 누른 자리에서 가장 가까운 음식점. 한 번에 카카오를 2번 부르므로 같은 IP는 1분에 30번까지
mapRouter.get(
  '/nearest-restaurant',
  requireAuth(),
  rateLimit({ windowMs: 60_000, limit: 30 }),
  validate({ query: nearestRestaurantQuery }),
  async (req, res) => {
    const query = req.query as unknown as NearestRestaurantQuery;
    ok(res, await findNearestRestaurant(query), '누른 자리의 음식점을 찾았어요.');
  },
);
