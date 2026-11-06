import { Router } from 'express';
import type { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { validate } from '../../common/middlewares/validate';
import { ok } from '../../common/response';
import { type RestaurantSearchQuery, restaurantSearchQuery } from '../search/search.schema';
import { searchRestaurants } from '../search/search.service';
import {
  type RestaurantLocationQuery,
  restaurantLocationQuery,
  restaurantParams,
} from './restaurant.schema';
import { getRestaurantDetail, getRestaurantPreview } from './restaurant.service';

/** /api/v1/restaurants */
export const restaurantRouter = Router();

// SEARCH-02 맛집 검색 (/:restaurantId보다 먼저 둔다)
restaurantRouter.get(
  '/search',
  requireAuth(),
  validate({ query: restaurantSearchQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { data, message } = await searchRestaurants(
      userId,
      req.query as unknown as RestaurantSearchQuery,
    );
    ok(res, data, message);
  },
);

// MAP-02 가게 미리보기
restaurantRouter.get(
  '/:restaurantId/preview',
  requireAuth(),
  validate({ params: restaurantParams, query: restaurantLocationQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { restaurantId } = req.params as unknown as z.infer<typeof restaurantParams>;
    const from = req.query as unknown as RestaurantLocationQuery;
    const data = await getRestaurantPreview(userId, BigInt(restaurantId), from);
    ok(res, data, '가게 미리보기를 조회했어요.');
  },
);

// REST-01 음식점 상세 조회
restaurantRouter.get(
  '/:restaurantId',
  requireAuth(),
  validate({ params: restaurantParams, query: restaurantLocationQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { restaurantId } = req.params as unknown as z.infer<typeof restaurantParams>;
    const from = req.query as unknown as RestaurantLocationQuery;
    const data = await getRestaurantDetail(userId, BigInt(restaurantId), from);
    ok(res, data, '음식점 상세를 조회했어요.');
  },
);
