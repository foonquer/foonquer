import { z } from 'zod';

/** query string 숫자 → number. 숫자 모양이 아니거나 범위를 벗어나면 INVALID_COORDINATE */
function coordinate(min: number, max: number) {
  return z
    .string({ error: 'INVALID_COORDINATE' })
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, { error: 'INVALID_COORDINATE' })
    .transform(Number)
    .pipe(
      z
        .number()
        .min(min, { error: 'INVALID_COORDINATE' })
        .max(max, { error: 'INVALID_COORDINATE' }),
    );
}

/** 위도 (WGS84, -90 ~ 90) */
export const latQuery = coordinate(-90, 90);
/** 경도 (WGS84, -180 ~ 180) */
export const lngQuery = coordinate(-180, 180);

/** 내 위치(선택). lat·lng 중 하나만 보내면 INVALID_COORDINATE (MAP-02, REST-01, SEARCH-02, RECO-01) */
export const optionalLocationQuery = z
  .object({ lat: latQuery.optional(), lng: lngQuery.optional() })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), {
    error: 'INVALID_COORDINATE',
  });

/** REGION-01 */
export const regionSearchQuery = z.object({
  keyword: z
    .string({ error: 'KEYWORD_REQUIRED' })
    .trim()
    .min(1, { error: 'KEYWORD_REQUIRED' })
    .max(20, { error: 'KEYWORD_TOO_LONG' }),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** REGION-02 */
export const currentRegionQuery = z.object({ lat: latQuery, lng: lngQuery });
