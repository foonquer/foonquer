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

export async function kakaoGet<T>(
  path: string,
  params: Record<string, string | number>,
  timeoutMs = TIMEOUT_MS,
) {
  const key = env.KAKAO_LOCAL_API_KEY ?? env.KAKAO_REST_API_KEY;
  if (!key) throw new KakaoApiError('KAKAO_REST_API_KEY 환경변수가 없습니다.');

  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(timeoutMs),
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

/**
 * 카카오 장소 검색 결과 한 곳 (필요한 필드만).
 * 카카오 이용 정책상 장소 ID 말고는 저장하지 않고 응답에만 쓴다.
 */
export interface KakaoPlace {
  id: string;
  place_name: string;
  phone: string;
}

/** 상세 화면이 카카오를 기다리는 최대 시간. 전화번호·링크는 덧붙이는 정보라 오래 기다리지 않는다 */
const PLACE_TIMEOUT_MS = 1500;

interface PlaceSearchResponse {
  documents: KakaoPlace[];
}

/**
 * 좌표 둘레 radiusM 안에서 키워드로 찾은 장소, 가까운 순 15곳 (음식점 상세 REST-01).
 * https://developers.kakao.com/docs/latest/ko/local/dev-guide#search-by-keyword
 */
export async function searchPlacesNear(query: string, lat: number, lng: number, radiusM: number) {
  const body = await kakaoGet<PlaceSearchResponse>(
    '/v2/local/search/keyword.json',
    { query, x: lng, y: lat, radius: radiusM, sort: 'distance', size: 15 },
    PLACE_TIMEOUT_MS,
  );
  return body.documents ?? [];
}

/**
 * 카테고리 검색 결과 한 곳 (필요한 필드만). 좌표·이름·거리는 응답을 만드는 데만 쓰고 저장하지 않는다.
 * x·y·distance는 카카오가 문자열로 준다
 */
export interface KakaoNearPlace {
  id: string;
  place_name: string;
  /** 경도 */
  x: string;
  /** 위도 */
  y: string;
  /** 기준 좌표에서 거리(m) */
  distance: string;
}

/** 음식점(FD6)·카페(CE7). 우리 가게(공공데이터 음식 업종)에 카페가 들어 있어 둘 다 본다 */
const FOOD_CATEGORY_CODES = ['FD6', 'CE7'];

/**
 * 좌표 둘레 radiusM 안의 음식점·카페 중 가장 가까운 곳 (MAP-03). 없으면 null.
 * https://developers.kakao.com/docs/latest/ko/local/dev-guide#search-by-category
 */
export async function nearestFoodPlace(lat: number, lng: number, radiusM: number) {
  const bodies = await Promise.all(
    FOOD_CATEGORY_CODES.map((code) =>
      kakaoGet<{ documents: KakaoNearPlace[] }>(
        '/v2/local/search/category.json',
        { category_group_code: code, x: lng, y: lat, radius: radiusM, sort: 'distance', size: 1 },
        PLACE_TIMEOUT_MS,
      ),
    ),
  );
  // 타입은 런타임에 보장되지 않으니 좌표·거리가 숫자인 곳만 쓴다 (빈 문자열·누락이면 버림)
  const isNumber = (v: unknown) =>
    typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v));
  const places = bodies
    .flatMap((b) => b.documents ?? [])
    .filter((p) => isNumber(p.x) && isNumber(p.y) && isNumber(p.distance));
  places.sort((a, b) => Number(a.distance) - Number(b.distance));
  return places[0] ?? null;
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
