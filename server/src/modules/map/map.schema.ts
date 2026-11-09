import { z } from 'zod';
import { distanceBetween } from '../../common/geo';
import { coordinateQuery, latQuery, lngQuery } from '../region/region.schema';

/** 화면 대각선이 이보다 길면 MAP_BOUNDS_TOO_LARGE (카카오 호출량·지도 성능을 위한 초안 값) */
export const MAX_MAP_DIAGONAL_M = 3000;

const latBound = coordinateQuery(-90, 90, 'INVALID_MAP_BOUNDS');
const lngBound = coordinateQuery(-180, 180, 'INVALID_MAP_BOUNDS');

/** MAP-01 */
export const mapRestaurantsQuery = z
  .object({
    swLat: latBound,
    swLng: lngBound,
    neLat: latBound,
    neLng: lngBound,
    categoryId: z.coerce
      .number({ error: 'INVALID_CATEGORY' })
      .int({ error: 'INVALID_CATEGORY' })
      .positive({ error: 'INVALID_CATEGORY' })
      .optional(),
    conquestState: z.enum(['CONQUERED', 'NOT_CONQUERED']).optional(),
    /** true면 내가 찜한 곳·정복한 곳(지난 시즌, 별점 대기 방문 포함)만 */
    mineOnly: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .refine((q) => q.swLat < q.neLat && q.swLng < q.neLng, { error: 'INVALID_MAP_BOUNDS' })
  .refine((q) => distanceBetween(q.swLat, q.swLng, q.neLat, q.neLng) <= MAX_MAP_DIAGONAL_M, {
    error: 'MAP_BOUNDS_TOO_LARGE',
  });

export type MapRestaurantsQuery = z.infer<typeof mapRestaurantsQuery>;

/** MAP-03. radiusM은 누른 곳에서 찾을 반경(m), 지도 확대 수준에 맞춰 웹이 정한다 */
export const nearbyPlacesQuery = z.object({
  lat: latQuery,
  lng: lngQuery,
  radiusM: z.coerce.number().int().min(10).max(100).default(30),
});

export type NearbyPlacesQuery = z.infer<typeof nearbyPlacesQuery>;
