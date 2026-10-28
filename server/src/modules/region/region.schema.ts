import { z } from 'zod';

/**
 * query string 숫자 → number. 숫자 모양이 아니거나 범위를 벗어나면 error 코드
 * (기본 INVALID_COORDINATE, 지도 영역은 INVALID_MAP_BOUNDS)
 */
export function coordinateQuery(min: number, max: number, error = 'INVALID_COORDINATE') {
  return z
    .string({ error })
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, { error })
    .transform(Number)
    .pipe(z.number().min(min, { error }).max(max, { error }));
}

/** 위도 (WGS84, -90 ~ 90) */
export const latQuery = coordinateQuery(-90, 90);
/** 경도 (WGS84, -180 ~ 180) */
export const lngQuery = coordinateQuery(-180, 180);

/**
 * 내 위치(선택) 필드 (MAP-02, REST-01, SEARCH-02, RECO-01). 다른 query와 같이 z.object()에 펼쳐 넣고
 * lat·lng 중 하나만 보내면 INVALID_COORDINATE가 되도록 .refine(hasLocationPair, { error: 'INVALID_COORDINATE' })를 붙인다.
 */
export const optionalLocationShape = { lat: latQuery.optional(), lng: lngQuery.optional() };

export function hasLocationPair(q: { lat?: number; lng?: number }) {
  return (q.lat === undefined) === (q.lng === undefined);
}

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
