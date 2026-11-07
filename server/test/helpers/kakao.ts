import { vi } from 'vitest';
import type { KakaoPlace } from '../../src/lib/kakao-local';

/** 카카오 장소 검색 결과 한 곳 */
export function kakaoPlace(overrides: Partial<KakaoPlace> & { id: string }): KakaoPlace {
  return {
    place_name: `카카오가게${overrides.id}`,
    phone: '02-1234-5678',
    ...overrides,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type PlaceHandler = (params: URLSearchParams) => KakaoPlace[] | number;

interface KakaoStub {
  /** 키워드 검색 (REST-01 전화번호·장소 ID). 숫자를 돌려주면 그 HTTP 상태로 실패 */
  keyword?: PlaceHandler;
  /** 좌표 → 법정동 코드 (없으면 빈 결과) */
  coord2region?: (params: URLSearchParams) => string | null;
}

/** 카카오 로컬 API를 흉내 낸다 */
export function stubKakao(stub: KakaoStub = {}) {
  const fetchMock = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const params = url.searchParams;
    if (url.pathname === '/v2/local/search/keyword.json') {
      const result = stub.keyword ? stub.keyword(params) : [];
      if (typeof result === 'number') return Promise.resolve(json({ message: 'error' }, result));
      return Promise.resolve(json({ meta: { is_end: true }, documents: result }));
    }
    if (url.pathname === '/v2/local/geo/coord2regioncode.json') {
      const code = stub.coord2region?.(params) ?? null;
      return Promise.resolve(json({ documents: code ? [{ region_type: 'B', code }] : [] }));
    }
    return Promise.reject(new Error(`unexpected ${url.toString()}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** fetch mock 호출 중 해당 카카오 경로의 query 목록 */
export function kakaoCalls(fetchMock: ReturnType<typeof stubKakao>, pathname: string) {
  return fetchMock.mock.calls
    .map(([input]) => new URL(input instanceof Request ? input.url : input))
    .filter((url) => url.pathname === pathname)
    .map((url) => url.searchParams);
}
