import { Router } from 'express';
import { authRouter } from './modules/auth/auth.router';
import { healthRouter } from './modules/health/health.router';
import { mapRouter } from './modules/map/map.router';
import { regionRouter } from './modules/region/region.router';
import { restaurantRouter } from './modules/restaurant/restaurant.router';
import { recommendationRouter, searchRouter } from './modules/search/search.router';
import {
  celebrationRouter,
  characterRouter,
  pointRouter,
  shopRouter,
} from './modules/mukkaebi/mukkaebi.router';
import { profileRouter, reportRouter } from './modules/profile/profile.router';
import { myRankingRouter, rankingRouter, seasonRouter } from './modules/ranking/ranking.router';
import {
  restaurantReviewRouter,
  reviewAspectRouter,
  reviewRouter,
  userReviewRouter,
  visitReviewRouter,
} from './modules/review/review.router';
import { savedRouter } from './modules/saved/saved.router';
import { uploadRouter } from './modules/upload/upload.router';
import { visitRouter } from './modules/visit/visit.router';
import { userRouter } from './modules/user/user.router';

/**
 * /api/v1 아래 라우터 모음. 도메인을 추가할 때 여기에 한 줄씩 붙인다.
 * 예) router.use('/reviews', reviewRouter);
 */
export const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/users/me/saved-restaurants', savedRouter);
router.use('/users/me/celebrations', celebrationRouter);
router.use('/users', userRouter);
router.use('/users', userReviewRouter);
router.use('/users', myRankingRouter);
router.use('/users', profileRouter);
router.use('/regions', regionRouter);
router.use('/map', mapRouter);
router.use('/restaurants', restaurantRouter);
router.use('/restaurants', restaurantReviewRouter);
router.use('/search', searchRouter);
router.use('/recommendations', recommendationRouter);
router.use('/uploads', uploadRouter);
router.use('/visit-verifications', visitRouter);
router.use('/visits', visitReviewRouter);
router.use('/reviews', reviewRouter);
router.use('/review-aspects', reviewAspectRouter);
router.use('/reports', reportRouter);
router.use('/seasons', seasonRouter);
router.use('/rankings', rankingRouter);
router.use('/characters', characterRouter);
router.use('/shop', shopRouter);
router.use('/points', pointRouter);
