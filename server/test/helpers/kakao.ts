import { vi } from 'vitest';
import type { KakaoPlace } from '../../src/lib/kakao-local';

/** 카카오 장소 검색 결과 한 곳 (기본은 가양동의 한식집) */
export function kakaoPlace(overrides: Partial<KakaoPlace> & { id: string }): KakaoPlace {
  return {
    place_name: `카카오가게${overrides.id}`,
    category_name: '음식점 > 한식 > 국밥',
    category_group_code: 'FD6',
    phone: '02-1234-5678',
    address_name: '서울 강서구 가양동 1487',
    road_address_name: '서울 강서구 가양로 123',
    x: '126.8545000',
    y: '37.5613000',
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
  /** 카테고리 검색 (MAP-01). 숫자를 돌려주면 그 HTTP 상태로 실패 */
  category?: PlaceHandler;
  /** 키워드 검색 (SEARCH-02) */
  keyword?: PlaceHandler;
  /** 좌표 → 법정동 코드 (없으면 빈 결과) */
  coord2region?: (params: URLSearchParams) => string | null;
}

/** 카카오 로컬 API를 흉내 낸다. 장소 검색은 page 1에 전부 주고 is_end = true */
export function stubKakao(stub: KakaoStub = {}) {
  const fetchMock = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const params = url.searchParams;
    const placeResult = (handler: PlaceHandler | undefined) => {
      const result = handler ? handler(params) : [];
      if (typeof result === 'number') return json({ message: 'error' }, result);
      return json({ meta: { is_end: true }, documents: result });
    };
    if (url.pathname === '/v2/local/search/category.json') {
      return Promise.resolve(placeResult(stub.category));
    }
    if (url.pathname === '/v2/local/search/keyword.json') {
      return Promise.resolve(placeResult(stub.keyword));
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
