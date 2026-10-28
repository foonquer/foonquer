import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadKakaoMaps } from '../lib/kakaoMaps';
import { resetViewRegionForTest, setViewRegion, useViewRegion } from '../lib/region';
import { requestMyCoords, setMyCoordsForTest } from '../lib/useMyCoords';
import { businessLine, businessText } from '../pages/restaurant/business';
import { fail, mockApi, ok } from './http';
import { renderRoute } from './render';

// 늦게 온 응답·멈춘 SDK·답하지 않는 위치 권한 팝업 같은 경우

/** 테스트가 정한 때에 끝나는 응답 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const localRegion = {
  localRegionId: 1,
  regionId: 11,
  dongName: '가양동',
  sigunguId: 2,
  sigunguName: '강서구',
  sortOrder: 0,
  regDate: '2026-10-01',
};
const me = { id: 1, nickname: '아기깨비', loginMethods: ['EMAIL'], localRegions: [localRegion] };
const GAYANG = { regionId: 11, dongName: '가양동', sigunguName: '강서구', lat: 37.56, lng: 126.85 };
const MANGWON = { regionId: 12, dongName: '망원동', sigunguName: '마포구', lat: 37.55, lng: 126.9 };

const card = (restaurantId: number, name: string) => ({
  restaurantId,
  name,
  categoryId: 1,
  categoryName: '한식',
  distanceM: null,
  rating: { score: 4.6, reviewCount: 120 },
  revisitRate: 58,
  localVisitRate: 72,
  conquestState: 'NOT_CONQUERED',
  matchedBy: 'NAME',
  matchedMenuName: null,
  rank: restaurantId,
  visitorCount: 30,
});

const page = (items: unknown[], pageNo: number, hasNext: boolean) =>
  ok({ items, page: pageNo, size: 20, totalCount: 3, hasNext, emptyGuide: null });

/** 위치 권한 팝업에 답하지 않은 브라우저 (콜백이 오지 않는다) */
function silentGeolocation() {
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition: () => undefined },
    configurable: true,
  });
}

beforeEach(() => {
  resetViewRegionForTest();
  setMyCoordsForTest(null);
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
});

describe('보고 있는 동네', () => {
  it('내 동네를 불러오는 사이 고른 동네를 늦게 온 응답이 덮지 않는다', async () => {
    const meReply = deferred<ReturnType<typeof ok>>();
    mockApi({
      'GET /users/me': () => meReply.promise,
      'GET /regions/search': ok({ keyword: '', items: [], totalCount: 0 }),
    });
    const { result } = renderHook(() => useViewRegion());

    act(() => setViewRegion(MANGWON));
    meReply.resolve(ok(me));

    await waitFor(() => expect(result.current.region?.regionId).toBe(12));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.region).toEqual(MANGWON);
  });
});

describe('내 위치', () => {
  it('권한 팝업에 답하지 않아도 5초 뒤에는 위치 없이 진행한다', async () => {
    vi.useFakeTimers();
    silentGeolocation();
    setMyCoordsForTest(undefined);

    const coords = requestMyCoords();
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(coords).resolves.toBeNull();
  });
});

describe('카카오 지도 SDK', () => {
  it('준비되지 않으면 시간 제한 뒤 실패하고, 붙였던 스크립트를 뗀다', async () => {
    vi.useFakeTimers();
    const loading = loadKakaoMaps('test-key');
    const result = expect(loading).rejects.toThrow('KAKAO_MAP_LOAD_FAILED');
    expect(document.querySelectorAll('script[src*="dapi.kakao.com"]')).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(10_000);

    await result;
    expect(document.querySelectorAll('script[src*="dapi.kakao.com"]')).toHaveLength(0);
  });
});

describe('맛집 검색 결과', () => {
  it('가까운 순이 아니면 위치 응답을 기다리지 않고 바로 찾는다', async () => {
    silentGeolocation();
    setMyCoordsForTest(undefined);
    resetViewRegionForTest(GAYANG);
    mockApi({ 'GET /restaurants/search': page([card(1, '가양분식')], 1, false) });

    renderRoute('/search?keyword=칼국수');

    expect(await screen.findByText('가양분식')).toBeInTheDocument();
  });

  it('가까운 순 주소로 들어왔는데 위치가 없으면 기본 정렬로 보여 준다', async () => {
    resetViewRegionForTest(GAYANG);
    const server = mockApi({ 'GET /restaurants/search': page([card(1, '가양분식')], 1, false) });
    const { router } = renderRoute('/search?keyword=칼국수&sort=DISTANCE');

    expect(await screen.findByText('가양분식')).toBeInTheDocument();
    expect(
      screen.getByText('위치를 알 수 없어 현지인 인기 순으로 보여 드려요'),
    ).toBeInTheDocument();
    expect(router.state.location.search).not.toContain('sort=');
    expect(server.calls('GET /restaurants/search').map((c) => c.query.get('sort'))).not.toContain(
      'DISTANCE',
    );
  });

  it('더 보기 응답이 정렬을 바꾼 뒤에 오면 버린다', async () => {
    resetViewRegionForTest(GAYANG);
    const oldPage2 = deferred<ReturnType<typeof ok>>();
    mockApi({
      'GET /restaurants/search': ({ query }) => {
        if (query.get('sort') === 'REVISIT') return page([card(9, '재방문집')], 1, false);
        return query.get('page') === '2' ? oldPage2.promise : page([card(1, '가양분식')], 1, true);
      },
    });
    renderRoute('/search?keyword=칼국수');

    fireEvent.click(await screen.findByRole('button', { name: '결과 더 보기' }));
    fireEvent.click(screen.getByRole('radio', { name: '재방문 많음' }));
    expect(await screen.findByText('재방문집')).toBeInTheDocument();

    oldPage2.resolve(page([card(2, '늦게온집')], 2, false));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('늦게온집')).not.toBeInTheDocument();
    expect(screen.queryByText('가양분식')).not.toBeInTheDocument();
    expect(screen.getByText('재방문집')).toBeInTheDocument();
  });

  it('찾지 못했을 때 다시 시도해 성공하면 결과를 보여 준다', async () => {
    resetViewRegionForTest(GAYANG);
    let calls = 0;
    mockApi({
      'GET /restaurants/search': () =>
        ++calls === 1
          ? fail(500, 'INTERNAL_SERVER_ERROR', '잠시 후 다시 시도해 주세요.')
          : page([card(1, '가양분식')], 1, false),
    });
    renderRoute('/search?keyword=칼국수');

    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('가양분식')).toBeInTheDocument();
  });
});

describe('추천 맛집 전체 목록', () => {
  it('불러오지 못했을 때 다시 시도해 성공하면 목록을 보여 준다', async () => {
    resetViewRegionForTest(GAYANG);
    let calls = 0;
    mockApi({
      'GET /recommendations': () =>
        ++calls === 1
          ? fail(500, 'INTERNAL_SERVER_ERROR', '잠시 후 다시 시도해 주세요.')
          : ok({
              type: 'LOCAL_POPULAR',
              region: {
                regionId: 11,
                level: 3,
                dongName: '가양동',
                sigunguId: 2,
                sigunguName: '강서구',
              },
              items: [card(1, '가양분식')],
              page: 1,
              size: 20,
              totalCount: 1,
              hasNext: false,
            }),
    });
    renderRoute('/recommendations/list');

    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('가양분식')).toBeInTheDocument();
  });

  it('위치 응답을 기다리지 않고 먼저 보여 준다', async () => {
    silentGeolocation();
    setMyCoordsForTest(undefined);
    resetViewRegionForTest(GAYANG);
    mockApi({
      'GET /recommendations': ok({
        type: 'LOCAL_POPULAR',
        region: { regionId: 11, level: 3, dongName: '가양동', sigunguId: 2, sigunguName: '강서구' },
        items: [card(1, '가양분식')],
        page: 1,
        size: 20,
        totalCount: 1,
        hasNext: false,
      }),
    });
    renderRoute('/recommendations/list');

    expect(await screen.findByText('가양분식')).toBeInTheDocument();
  });
});

describe('위치가 늦게 올 때', () => {
  /** 테스트가 정한 때에 위치를 알려 주는 브라우저 */
  function lateGeolocation() {
    let give!: (lat: number, lng: number) => void;
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (ok: PositionCallback) => {
          give = (lat, lng) =>
            ok({ coords: { latitude: lat, longitude: lng } } as GeolocationPosition);
        },
      },
      configurable: true,
    });
    setMyCoordsForTest(undefined);
    return (lat: number, lng: number) => act(() => give(lat, lng));
  }

  const recoPage = (items: unknown[], pageNo: number, hasNext: boolean) =>
    ok({
      type: 'LOCAL_POPULAR',
      region: { regionId: 11, level: 3, dongName: '가양동', sigunguId: 2, sigunguName: '강서구' },
      items,
      page: pageNo,
      size: 20,
      totalCount: 2,
      hasNext,
    });

  it('펼친 쪽까지 거리를 붙여 다시 받는다', async () => {
    const give = lateGeolocation();
    resetViewRegionForTest(GAYANG);
    const server = mockApi({
      'GET /recommendations': ({ query }) =>
        query.get('page') === '2'
          ? recoPage([card(2, '둘째집')], 2, false)
          : recoPage([card(1, '첫째집')], 1, true),
    });
    renderRoute('/recommendations/list');

    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
    expect(await screen.findByText('둘째집')).toBeInTheDocument();

    await give(37.56, 126.85);
    await waitFor(() =>
      expect(server.calls('GET /recommendations').filter((c) => c.query.has('lat'))).toHaveLength(
        2,
      ),
    );
    expect(screen.getByText('첫째집')).toBeInTheDocument();
    expect(screen.getByText('둘째집')).toBeInTheDocument();
  });

  it('다시 받다가 실패해도 보던 목록은 그대로 두고 알린다', async () => {
    const give = lateGeolocation();
    resetViewRegionForTest(GAYANG);
    mockApi({
      'GET /recommendations': ({ query }) =>
        query.has('lat')
          ? fail(500, 'INTERNAL_SERVER_ERROR', '잠시 후 다시 시도해 주세요.')
          : recoPage([card(1, '첫째집')], 1, false),
    });
    renderRoute('/recommendations/list');
    expect(await screen.findByText('첫째집')).toBeInTheDocument();

    await give(37.56, 126.85);

    expect(await screen.findByText('잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.getByText('첫째집')).toBeInTheDocument();
  });
});

describe('영업 상태 문구', () => {
  it('닫혀 있으면 여는 시각 전·쉬는 시간·닫은 뒤를 모두 "영업시간 외"로 쓴다', () => {
    const closed = { isOpen: false, todayOpenTime: '11:00', todayCloseTime: '21:00' };
    expect(businessText(closed)).toBe('영업시간 외');
    expect(businessLine(closed)).toBe('영업시간 외 · 11:00–21:00');
    expect(businessText({ isOpen: false, todayOpenTime: null, todayCloseTime: null })).toBe(
      '오늘 휴무',
    );
  });
});
