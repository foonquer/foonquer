import { z } from 'zod';
import { pageQuery } from '../../common/pagination';

export const MAX_REVIEW_IMAGES = 5;

const overallScore = z
  .number({ error: 'INVALID_OVERALL_SCORE' })
  .min(0.5, { error: 'INVALID_OVERALL_SCORE' })
  .max(5, { error: 'INVALID_OVERALL_SCORE' })
  .refine((v) => Number.isInteger(v * 2), { error: 'INVALID_OVERALL_SCORE' });

const detailScore = z
  .number({ error: 'INVALID_DETAIL_SCORES' })
  .int({ error: 'INVALID_DETAIL_SCORES' })
  .min(1, { error: 'INVALID_DETAIL_SCORES' })
  .max(5, { error: 'INVALID_DETAIL_SCORES' });

/** 세부 별점 5항목 (다섯 개 모두 보내야 한다) */
export const detailScores = z.object(
  {
    taste: detailScore,
    cleanliness: detailScore,
    portion: detailScore,
    service: detailScore,
    price: detailScore,
  },
  { error: 'INVALID_DETAIL_SCORES' },
);

const aspects = z
  .array(
    z.object({
      aspectId: z
        .number({ error: 'INVALID_ASPECT' })
        .int({ error: 'INVALID_ASPECT' })
        .positive({ error: 'INVALID_ASPECT' }),
      polarity: z.enum(['G', 'B'], { error: 'INVALID_ASPECT' }),
    }),
    { error: 'INVALID_ASPECT' },
  )
  .max(20, { error: 'INVALID_ASPECT' })
  .refine((list) => new Set(list.map((a) => a.aspectId)).size === list.length, {
    error: 'INVALID_ASPECT',
  });

const content = z.string().trim().max(300, { error: 'REVIEW_CONTENT_TOO_LONG' });

const imageKeys = z
  .array(z.string().min(1).max(255))
  .max(MAX_REVIEW_IMAGES, { error: 'TOO_MANY_IMAGES' })
  .refine((keys) => new Set(keys).size === keys.length, { error: 'TOO_MANY_IMAGES' });

export const visitParams = z.object({ visitId: z.coerce.number().int().positive() });
export const reviewParams = z.object({ reviewId: z.coerce.number().int().positive() });
export const userParams = z.object({ userId: z.coerce.number().int().positive() });
export const restaurantReviewParams = z.object({
  restaurantId: z.coerce.number().int().positive(),
});

/** REVIEW-01 */
export const ratingBody = z.object({ overallScore });
export type RatingBody = z.infer<typeof ratingBody>;

/** REVIEW-02 세부평가 (모두 선택, 하나는 있어야 한다) */
export const reviewDetailBody = z.object({
  detailScores: detailScores.optional(),
  aspects: aspects.optional(),
  content: content.optional(),
  imageKeys: imageKeys.optional(),
});
export type ReviewDetailBody = z.infer<typeof reviewDetailBody>;

/** REVIEW-06 수정 — 보낸 항목만 바꾼다. detailScores·content는 null이면 지운다 */
export const reviewUpdateBody = z.object({
  overallScore: overallScore.optional(),
  detailScores: detailScores.nullable().optional(),
  aspects: aspects.optional(),
  content: content.nullable().optional(),
  imageKeys: imageKeys.optional(),
});
export type ReviewUpdateBody = z.infer<typeof reviewUpdateBody>;

/** REVIEW-08 */
export const reactionBody = z.object({
  type: z.enum(['HELPFUL', 'UNHELPFUL'], { error: 'INVALID_REACTION' }),
});
export type ReactionBody = z.infer<typeof reactionBody>;

const booleanQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/** REVIEW-03 */
export const restaurantReviewQuery = z.object({
  ...pageQuery,
  sort: z
    .enum(['LATEST', 'HELPFUL', 'SCORE_HIGH', 'SCORE_LOW'], { error: 'INVALID_REVIEW_SORT' })
    .default('LATEST'),
  photoOnly: booleanQuery,
  localOnly: booleanQuery,
});
export type RestaurantReviewQuery = z.infer<typeof restaurantReviewQuery>;

/** REVIEW-05·10 */
export const userReviewQuery = z.object({
  ...pageQuery,
  sort: z.enum(['LATEST', 'HELPFUL'], { error: 'INVALID_REVIEW_SORT' }).default('LATEST'),
});
export type UserReviewQuery = z.infer<typeof userReviewQuery>;
