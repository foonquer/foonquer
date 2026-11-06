import { Router } from 'express';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { ok } from '../../common/response';
import { getHomeSummary, getMySummary } from './home.service';

/** /api/v1/home — HOME-01 */
export const homeRouter = Router();

homeRouter.get('/summary', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getHomeSummary(userId), '홈 요약을 조회했어요.');
});

/** /api/v1/users/me/summary — USER-08 */
export const mySummaryRouter = Router();

mySummaryRouter.get('/', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getMySummary(userId), '내 정보 요약을 조회했어요.');
});
