import { env } from '../config/env';

/**
 * 카카오 로컬 API (https://developers.kakao.com/docs/latest/ko/local/dev-guide)
 * REST 키는 서버 환경변수(KAKAO_REST_API_KEY)에만 둔다.
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
  if (!env.KAKAO_REST_API_KEY) throw new KakaoApiError('KAKAO_REST_API_KEY 환경변수가 없습니다.');

  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` },
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
