import { Router } from 'express';
import type { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { validate } from '../../common/middlewares/validate';
import { created, ok } from '../../common/response';
import { cancelReaction, reactToReview } from './reaction.service';
import {
  type RatingBody,
  ratingBody,
  type ReactionBody,
  reactionBody,
  restaurantReviewParams,
  type RestaurantReviewQuery,
  restaurantReviewQuery,
  type ReviewDetailBody,
  reviewDetailBody,
  reviewParams,
  type ReviewUpdateBody,
  reviewUpdateBody,
  userParams,
  type UserReviewQuery,
  userReviewQuery,
  visitParams,
} from './review.schema';
import {
  addReviewDetail,
  deleteReviewDetail,
  getReview,
  listMemberReviews,
  listMyReviews,
  listRestaurantReviews,
  listReviewAspects,
  rateVisit,
  updateReview,
} from './review.service';

type VisitParams = z.infer<typeof visitParams>;
type ReviewParams = z.infer<typeof reviewParams>;

/** /api/v1/visits — 별점·세부평가 */
export const visitReviewRouter = Router();

// REVIEW-01 종합 별점 등록 및 정복 완료
visitReviewRouter.post(
  '/:visitId/rating',
  requireAuth(),
  validate({ params: visitParams, body: ratingBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { visitId } = req.params as unknown as VisitParams;
    const data = await rateVisit(userId, visitId, req.body as RatingBody);
    created(
      res,
      data,
      data.conquest.isNewConquest ? '정복 완료! 먹깨비가 도착했어요.' : '별점을 남겼어요.',
    );
  },
);

// REVIEW-02 세부평가 (세부 별점·좋았던/아쉬웠던 점·글·사진)
visitReviewRouter.post(
  '/:visitId/review',
  requireAuth(),
  validate({ params: visitParams, body: reviewDetailBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { visitId } = req.params as unknown as VisitParams;
    const data = await addReviewDetail(userId, visitId, req.body as ReviewDetailBody);
    created(
      res,
      data,
      data.rewards.point > 0 ? `리뷰를 남겼어요! +${data.rewards.point}P` : '리뷰를 남겼어요.',
    );
  },
);

/** /api/v1/reviews */
export const reviewRouter = Router();

// REVIEW-04 리뷰 상세
reviewRouter.get(
  '/:reviewId',
  requireAuth(),
  validate({ params: reviewParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { reviewId } = req.params as unknown as ReviewParams;
    ok(res, await getReview(userId, reviewId), '리뷰를 조회했어요.');
  },
);

// REVIEW-06 리뷰 수정
reviewRouter.patch(
  '/:reviewId',
  requireAuth(),
  validate({ params: reviewParams, body: reviewUpdateBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { reviewId } = req.params as unknown as ReviewParams;
    ok(res, await updateReview(userId, reviewId, req.body as ReviewUpdateBody), '리뷰를 고쳤어요.');
  },
);

// REVIEW-07 리뷰 삭제 (세부평가만, 종합 별점은 남김)
reviewRouter.delete(
  '/:reviewId',
  requireAuth(),
  validate({ params: reviewParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { reviewId } = req.params as unknown as ReviewParams;
    ok(
      res,
      await deleteReviewDetail(userId, reviewId),
      '리뷰를 지웠어요. 별점은 정복 기록으로 남아요.',
    );
  },
);

// REVIEW-08 도움돼요·별로예요
reviewRouter.put(
  '/:reviewId/reaction',
  requireAuth(),
  validate({ params: reviewParams, body: reactionBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { reviewId } = req.params as unknown as ReviewParams;
    const data = await reactToReview(userId, reviewId, req.body as ReactionBody);
    ok(res, data, data.myReaction === 'HELPFUL' ? '도움돼요를 눌렀어요.' : '별로예요를 눌렀어요.');
  },
);

// REVIEW-09 반응 취소
reviewRouter.delete(
  '/:reviewId/reaction',
  requireAuth(),
  validate({ params: reviewParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { reviewId } = req.params as unknown as ReviewParams;
    ok(res, await cancelReaction(userId, reviewId), '평가를 취소했어요.');
  },
);

/** /api/v1/restaurants/:restaurantId/reviews — REVIEW-03 */
export const restaurantReviewRouter = Router();

restaurantReviewRouter.get(
  '/:restaurantId/reviews',
  requireAuth(),
  validate({ params: restaurantReviewParams, query: restaurantReviewQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { restaurantId } = req.params as unknown as z.infer<typeof restaurantReviewParams>;
    const data = await listRestaurantReviews(
      userId,
      restaurantId,
      req.query as unknown as RestaurantReviewQuery,
    );
    ok(res, data, '리뷰 목록을 조회했어요.');
  },
);

/** /api/v1/users — REVIEW-05(내 리뷰), REVIEW-10(탐방러 리뷰) */
export const userReviewRouter = Router();

userReviewRouter.get(
  '/me/reviews',
  requireAuth(),
  validate({ query: userReviewQuery }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    ok(
      res,
      await listMyReviews(userId, req.query as unknown as UserReviewQuery),
      '내 리뷰를 조회했어요.',
    );
  },
);

userReviewRouter.get(
  '/:userId/reviews',
  requireAuth(),
  validate({ params: userParams, query: userReviewQuery }),
  async (req, res) => {
    const viewer = getAuthUser(req);
    const { userId } = req.params as unknown as z.infer<typeof userParams>;
    const data = await listMemberReviews(
      viewer.userId,
      userId,
      req.query as unknown as UserReviewQuery,
    );
    ok(res, data, '리뷰를 조회했어요.');
  },
);

/** /api/v1/review-aspects — REVIEW-11 */
export const reviewAspectRouter = Router();

reviewAspectRouter.get('/', requireAuth(), async (_req, res) => {
  ok(res, await listReviewAspects(), '칩 목록을 조회했어요.');
});
