import { z } from 'zod';
import { hasLocationPair, optionalLocationShape } from '../region/region.schema';

/** MAP-02, REST-01 경로 */
export const restaurantParams = z.object({
  restaurantId: z.coerce.number().int().positive(),
});

/** MAP-02, REST-01 query (내 위치는 선택) */
export const restaurantLocationQuery = z
  .object(optionalLocationShape)
  .refine(hasLocationPair, { error: 'INVALID_COORDINATE' });

export type RestaurantLocationQuery = z.infer<typeof restaurantLocationQuery>;
