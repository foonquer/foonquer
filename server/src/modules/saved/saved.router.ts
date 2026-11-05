import { Router } from 'express';
import type { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { validate } from '../../common/middlewares/validate';
import { ok } from '../../common/response';
import './saved.errors';
import {
  listSaved,
  type SaveBody,
  saveBody,
  savedListQuery,
  type SavedListQuery,
  savedParams,
  saveRestaurant,
  unsaveRestaurant,
} from './saved.service';

type Params = z.infer<typeof savedParams>;

/** /api/v1/users/me/saved-restaurants */
export const savedRouter = Router();

// LIST-01 저장한 맛집 (가고 싶은 곳 / 정복한 곳)
savedRouter.get('/', requireAuth(), validate({ query: savedListQuery }), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(
    res,
    await listSaved(userId, req.query as unknown as SavedListQuery),
    '저장한 맛집을 조회했어요.',
  );
});

// LIST-02 저장
savedRouter.put(
  '/:restaurantId',
  requireAuth(),
  validate({ params: savedParams, body: saveBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { restaurantId } = req.params as unknown as Params;
    ok(
      res,
      await saveRestaurant(userId, restaurantId, req.body as SaveBody),
      '가고 싶은 곳에 저장했어요.',
    );
  },
);

// LIST-03 저장 취소
savedRouter.delete(
  '/:restaurantId',
  requireAuth(),
  validate({ params: savedParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { restaurantId } = req.params as unknown as Params;
    ok(res, await unsaveRestaurant(userId, restaurantId), '저장을 취소했어요.');
  },
);
