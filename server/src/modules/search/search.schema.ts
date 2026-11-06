import { z } from 'zod';
import { pageQuery } from '../../common/pagination';
import { hasLocationPair, optionalLocationShape } from '../region/region.schema';

const categoryIdQuery = z.coerce
  .number({ error: 'INVALID_CATEGORY' })
  .int({ error: 'INVALID_CATEGORY' })
  .positive({ error: 'INVALID_CATEGORY' })
  .optional();

const regionIdQuery = z.coerce.number().int().positive().optional();

/** SEARCH-01 */
export const searchHomeQuery = z.object({ regionId: regionIdQuery });

/** SEARCH-02 (keyword 30자 제한은 SEARCH_KEYWORD_TOO_LONG 문구 때문에 서비스에서 확인한다) */
export const restaurantSearchQuery = z
  .object({
    keyword: z
      .string()
      .trim()
      .optional()
      .transform((k) => (k ? k : undefined)),
    categoryId: categoryIdQuery,
    regionId: regionIdQuery,
    scope: z.enum(['DONG', 'SIGUNGU'], { error: 'INVALID_SCOPE' }).default('DONG'),
    sort: z
      .enum(['LOCAL_POPULAR', 'REVISIT', 'DISTANCE'], { error: 'INVALID_SORT' })
      .default('LOCAL_POPULAR'),
    ...optionalLocationShape,
    ...pageQuery,
  })
  .refine(hasLocationPair, { error: 'INVALID_COORDINATE' });

export type RestaurantSearchQuery = z.infer<typeof restaurantSearchQuery>;

/** RECO-01 */
export const recommendationQuery = z
  .object({
    type: z
      .enum(['LOCAL_POPULAR', 'REVISIT', 'RATING'], { error: 'INVALID_RECOMMENDATION_TYPE' })
      .default('LOCAL_POPULAR'),
    regionId: regionIdQuery,
    categoryId: categoryIdQuery,
    ...optionalLocationShape,
    ...pageQuery,
  })
  .refine(hasLocationPair, { error: 'INVALID_COORDINATE' });

export type RecommendationQuery = z.infer<typeof recommendationQuery>;
