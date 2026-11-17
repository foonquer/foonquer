import { Router } from 'express';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { rateLimit } from '../../common/middlewares/rate-limit';
import { validate } from '../../common/middlewares/validate';
import { created, ok } from '../../common/response';
import {
  type MapaeObjectionBody,
  type MapaeReportBody,
  mapaeObjectionBody,
  mapaeReportBody,
  mapaeReportParams,
  mapaeRestaurantParams,
} from './mapae.schema';
import { createMapaeObjection, createMapaeReport, getMyMapaeReport } from './mapae.service';

/** /api/v1/restaurants/:restaurantId — MAPAE-01·03 */
export const restaurantMapaeRouter = Router();

restaurantMapaeRouter.post(
  '/:restaurantId/mapae-reports',
  requireAuth(),
  rateLimit({ windowMs: 60_000, limit: 5 }),
  validate({ params: mapaeRestaurantParams, body: mapaeReportBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { restaurantId } = req.params as unknown as { restaurantId: number };
    const report = await createMapaeReport(userId, restaurantId, req.body as MapaeReportBody);
    created(
      res,
      report,
      report.status === 'CONFIRMED'
        ? '제보가 확인돼 마패가 붙었어요.'
        : '제보를 접수했어요. 다른 방문자 제보가 모이면 마패가 붙어요.',
    );
  },
);

restaurantMapaeRouter.post(
  '/:restaurantId/mapae-objections',
  requireAuth(),
  rateLimit({ windowMs: 60_000, limit: 5 }),
  validate({ params: mapaeRestaurantParams, body: mapaeObjectionBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { restaurantId } = req.params as unknown as { restaurantId: number };
    created(
      res,
      await createMapaeObjection(userId, restaurantId, req.body as MapaeObjectionBody),
      '이의제기를 접수했어요. 답변은 알림으로 알려 드려요.',
    );
  },
);

/** /api/v1/mapae-reports — MAPAE-02 */
export const mapaeReportRouter = Router();

mapaeReportRouter.get(
  '/:reportId',
  requireAuth(),
  validate({ params: mapaeReportParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { reportId } = req.params as unknown as { reportId: number };
    ok(res, await getMyMapaeReport(userId, reportId), '제보 현황을 조회했어요.');
  },
);
