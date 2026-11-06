import { Router } from 'express';
import { authRouter } from './modules/auth/auth.router';
import { healthRouter } from './modules/health/health.router';
import { mapRouter } from './modules/map/map.router';
import { regionRouter } from './modules/region/region.router';
import { restaurantRouter } from './modules/restaurant/restaurant.router';
import { recommendationRouter, searchRouter } from './modules/search/search.router';
import { uploadRouter } from './modules/upload/upload.router';
import { userRouter } from './modules/user/user.router';

/**
 * /api/v1 아래 라우터 모음. 도메인을 추가할 때 여기에 한 줄씩 붙인다.
 * 예) router.use('/reviews', reviewRouter);
 */
export const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/users', userRouter);
router.use('/regions', regionRouter);
router.use('/map', mapRouter);
router.use('/restaurants', restaurantRouter);
router.use('/search', searchRouter);
router.use('/recommendations', recommendationRouter);
router.use('/uploads', uploadRouter);
