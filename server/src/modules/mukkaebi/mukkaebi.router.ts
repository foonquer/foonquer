import { Router } from 'express';
import type { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { validate } from '../../common/middlewares/validate';
import { ok } from '../../common/response';
import {
  type AppearanceBody,
  appearanceBody,
  celebrationParams,
  type ItemCategoryQuery,
  itemCategoryQuery,
  itemParams,
  type PointHistoryQuery,
  pointHistoryQuery,
  type PurchaseBody,
  purchaseBody,
  type ShopQuery,
  shopQuery,
} from './mukkaebi.schema';
import {
  craftItem,
  getCollection,
  getMyItems,
  getMyMukkaebi,
  listCelebrations,
  markCelebrationSeen,
  saveAppearance,
} from './mukkaebi.service';
import {
  getMyPoints,
  getPointHistory,
  getShopItem,
  listShopItems,
  purchaseItem,
} from './shop.service';

type ItemParams = z.infer<typeof itemParams>;

/** /api/v1/characters — CHAR-01·02·03·07·10 */
export const characterRouter = Router();

characterRouter.get('/me', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getMyMukkaebi(userId), '내 먹깨비를 조회했어요.');
});

characterRouter.get(
  '/me/items',
  requireAuth(),
  validate({ query: itemCategoryQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    ok(
      res,
      await getMyItems(userId, req.query as unknown as ItemCategoryQuery),
      '보유 아이템을 조회했어요.',
    );
  },
);

characterRouter.put(
  '/me/appearance',
  requireAuth(),
  validate({ body: appearanceBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    ok(res, await saveAppearance(userId, req.body as AppearanceBody), '꾸미기를 저장했어요.');
  },
);

characterRouter.get('/me/collection', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getCollection(userId), '도감을 조회했어요.');
});

characterRouter.post(
  '/me/items/:itemId/craft',
  requireAuth(),
  validate({ params: itemParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { itemId } = req.params as unknown as ItemParams;
    const data = await craftItem(userId, itemId);
    ok(res, data, `${data.item.name}을 만들었어요!`);
  },
);

/** /api/v1/users/me/celebrations — CHAR-08·09 */
export const celebrationRouter = Router();

celebrationRouter.get('/', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await listCelebrations(userId), '축하 이벤트를 조회했어요.');
});

celebrationRouter.patch(
  '/:celebrationId/seen',
  requireAuth(),
  validate({ params: celebrationParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { celebrationId } = req.params as unknown as z.infer<typeof celebrationParams>;
    ok(res, await markCelebrationSeen(userId, celebrationId), '확인했어요.');
  },
);

/** /api/v1/shop — SHOP-01·02·03 */
export const shopRouter = Router();

shopRouter.get('/items', requireAuth(), validate({ query: shopQuery }), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(
    res,
    await listShopItems(userId, req.query as unknown as ShopQuery),
    '상점 아이템을 조회했어요.',
  );
});

shopRouter.get(
  '/items/:itemId',
  requireAuth(),
  validate({ params: itemParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { itemId } = req.params as unknown as ItemParams;
    ok(res, await getShopItem(userId, itemId), '아이템을 조회했어요.');
  },
);

shopRouter.post('/purchases', requireAuth(), validate({ body: purchaseBody }), async (req, res) => {
  const { userId } = getAuthUser(req);
  const data = await purchaseItem(userId, req.body as PurchaseBody);
  ok(res, data, `${data.name}을 샀어요!`);
});

/** /api/v1/points — POINT-01·02 */
export const pointRouter = Router();

pointRouter.get('/me', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getMyPoints(userId), '먹포인트를 조회했어요.');
});

pointRouter.get(
  '/me/history',
  requireAuth(),
  validate({ query: pointHistoryQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    ok(
      res,
      await getPointHistory(userId, req.query as unknown as PointHistoryQuery),
      '먹포인트 내역을 조회했어요.',
    );
  },
);
