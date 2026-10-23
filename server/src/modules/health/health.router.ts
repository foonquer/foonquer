import { Router } from 'express';
import { ok } from '../../common/response';

export const healthRouter = Router();

// 배포·Docker HEALTHCHECK용. DB는 확인하지 않는다(서버 프로세스가 살아 있는지만).
healthRouter.get('/', (_req, res) => {
  ok(res, { status: 'ok' });
});
