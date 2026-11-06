import { env } from '../config/env';

/**
 * 카카오 로컬 API (https://developers.kakao.com/docs/latest/ko/local/dev-guide)
 * REST 키는 서버 환경변수(KAKAO_LOCAL_API_KEY, 없으면 KAKAO_REST_API_KEY)에만 둔다.
 */

const BASE_URL = 'https://dapi.kakao.com';
const TIMEOUT_MS = 3000;

export class KakaoApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'KakaoApiError';
  }
}

export async function kakaoGet<T>(path: string, params: Record<string, string | number>) {
  const key = env.KAKAO_LOCAL_API_KEY ?? env.KAKAO_REST_API_KEY;
  if (!key) throw new KakaoApiError('KAKAO_REST_API_KEY 환경변수가 없습니다.');

  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new KakaoApiError(`카카오 요청 실패: ${path}`, { cause: err });
  }
  if (!res.ok) throw new KakaoApiError(`카카오 응답 ${res.status}: ${path}`);
  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new KakaoApiError(`카카오 응답을 읽지 못했습니다: ${path}`, { cause: err });
  }
}

/** 카카오 장소 검색 결과 한 곳 (필요한 필드만) */
export interface KakaoPlace {
  id: string;
  place_name: string;
  /** 예) 음식점 > 한식 > 칼국수 */
  category_name: string;
  /** FD6 음식점 / CE7 카페 */
  category_group_code: string;
  phone: string;
  /** 지번 주소. 예) 서울 강서구 가양동 1487 */
  address_name: string;
  road_address_name: string;
  /** 경도 */
  x: string;
  /** 위도 */
  y: string;
}

interface PlaceSearchResponse {
  meta: { is_end: boolean };
  documents: KakaoPlace[];
}

/** 음식점(FD6)·카페(CE7). 카카오는 요청 한 번에 그룹 코드 하나만 받는다 */
const PLACE_GROUP_CODES = ['FD6', 'CE7'] as const;
/** 한 그룹에서 최대 page 3 × size 15 = 45곳 (카카오 한도) */
const MAX_PAGES = 3;
const PAGE_SIZE = 15;

/** [남, 서, 북, 동] → 카카오 rect "서(최소 경도),남(최소 위도),동(최대 경도),북(최대 위도)" */
function rectParam([south, west, north, east]: readonly [number, number, number, number]) {
  return `${west},${south},${east},${north}`;
}

async function collectPages(path: string, params: Record<string, string | number>) {
  const places: KakaoPlace[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const body = await kakaoGet<PlaceSearchResponse>(path, { ...params, page, size: PAGE_SIZE });
    places.push(...(body.documents ?? []));
    if (body.meta?.is_end !== false) break;
  }
  return places;
}

/**
 * 사각형 안의 음식점·카페 (카테고리 검색, MAP-01).
 * https://developers.kakao.com/docs/latest/ko/local/dev-guide#search-by-category
 */
export async function searchPlacesInRect(bbox: readonly [number, number, number, number]) {
  const lists = await Promise.all(
    PLACE_GROUP_CODES.map((code) =>
      collectPages('/v2/local/search/category.json', {
        category_group_code: code,
        rect: rectParam(bbox),
      }),
    ),
  );
  return lists.flat();
}

/**
 * 사각형 안에서 키워드로 찾은 음식점·카페 (키워드 검색, SEARCH-02).
 * https://developers.kakao.com/docs/latest/ko/local/dev-guide#search-by-keyword
 */
export async function searchPlacesByKeyword(
  query: string,
  bbox: readonly [number, number, number, number],
) {
  const lists = await Promise.all(
    PLACE_GROUP_CODES.map((code) =>
      collectPages('/v2/local/search/keyword.json', {
        query,
        category_group_code: code,
        rect: rectParam(bbox),
      }),
    ),
  );
  return lists.flat();
}

interface RegionCodeResponse {
  documents: { region_type: string; code: string }[];
}

/**
 * 좌표 → 법정동 코드(region_type B, 10자리). 우리나라 밖 등 결과가 없으면 null.
 * https://developers.kakao.com/docs/latest/ko/local/dev-guide#coord-to-district
 */
export async function coordToLegalDongCode(lat: number, lng: number): Promise<string | null> {
  const body = await kakaoGet<RegionCodeResponse>('/v2/local/geo/coord2regioncode.json', {
    x: lng,
    y: lat,
  });
  return body.documents?.find((d) => d.region_type === 'B')?.code ?? null;
}
