import { Router } from 'express';
import { healthRouter } from './modules/health/health.router';

/**
 * /api/v1 아래 라우터 모음. 도메인을 추가할 때 여기에 한 줄씩 붙인다.
 * 예) router.use('/reviews', reviewRouter);
 */
export const router = Router();

router.use('/health', healthRouter);
