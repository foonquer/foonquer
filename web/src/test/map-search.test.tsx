import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetViewRegionForTest } from '../lib/region';
import { setMyCoordsForTest } from '../lib/useMyCoords';
import { fail, mockApi, ok } from './http';
import { renderRoute } from './render';

const GAYANG = {
  regionId: 11,
  dongName: '가양동',
  sigunguId: 2,
  sigunguName: '강서구',
  fullName: '서울특별시 강서구 가양동',
  centerLat: 37.5617,
  centerLng: 126.8545,
};
const MANGWON = {
  ...GAYANG,
  regionId: 12,
  dongName: '망원동',
  sigunguName: '마포구',
  fullName: '서울특별시 마포구 망원동',
  centerLat: 37.556,
  centerLng: 126.901,
};

const me = {
  id: 1,
  nickname: '아기깨비',
  localRegions: [
    {
      localRegionId: 1,
      regionId: 11,
      dongName: '가양동',
      sigunguId: 2,
      sigunguName: '강서구',
      sortOrder: 0,
      regDate: '2026-10-01',
    },
  ],
};

const pin = (restaurantId: number, name: string, conquestState: string) => ({
  restaurantId,
  name,
  categoryId: 1,
  categoryName: '한식',
  lat: 37.562,
  lng: 126.855,
  conquestState,
  conqueredInPastSeason: false,
  isSaved: false,
});

const card = (restaurantId: number, name: string, conquestState = 'NOT_CONQUERED') => ({
  restaurantId,
  name,
  categoryId: 1,
  categoryName: '한식',
  distanceM: 410,
  rating: { score: 4.6, reviewCount: 120 },
  revisitRate: 58,
  localVisitRate: 72,
  conquestState,
  matchedBy: 'NAME',
  matchedMenuName: null,
  rank: restaurantId,
  visitorCount: 30,
});

/** 보고 있는 동네를 정할 때 쓰는 API (내 동네 → 동 중심 좌표) */
const regionApi = {
  'GET /users/me': ok(me),
  'GET /regions/search': ({ query }: { query: URLSearchParams }) => {
    const keyword = query.get('keyword') ?? '';
    const items = [GAYANG, MANGWON].filter((d) =>
      keyword.split(' ').every((w) => d.fullName.includes(w)),
    );
    return ok({ keyword, items, totalCount: items.length });
  },
};

beforeEach(() => {
  resetViewRegionForTest();
  setMyCoordsForTest(null);
});

describe('홈 지도 (MAP-01·02)', () => {
  it('내 동네 중심으로 지도 영역의 가게를 불러와 핀으로 보여 준다', async () => {
    const server = mockApi({
      ...regionApi,
      'GET /map/restaurants': ok({
        items: [pin(1, '옛날손칼국수', 'CONQUERED'), pin(2, '이가네떡볶이', 'NOT_CONQUERED')],
        totalCount: 2,
        truncated: false,
        kakaoSynced: true,
      }),
    });
    renderRoute('/');

    expect(
      await screen.findByRole('button', { name: '옛날손칼국수 (정복 완료)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이가네떡볶이 (미정복)' })).toBeInTheDocument();
    expect(screen.getByText('아기깨비')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '지역 바꾸기 (지금: 강서구 · 가양동)' }),
    ).toBeInTheDocument();

    // 가양동 중심을 감싸는 영역으로 물었다
    const q = server.calls('GET /map/restaurants')[0].query;
    expect(Number(q.get('swLat'))).toBeLessThan(GAYANG.centerLat);
    expect(Number(q.get('neLat'))).toBeGreaterThan(GAYANG.centerLat);
    expect(Number(q.get('swLng'))).toBeLessThan(GAYANG.centerLng);
    expect(Number(q.get('neLng'))).toBeGreaterThan(GAYANG.centerLng);
  });

  it('지도가 너무 넓으면 확대해 달라고 안내한다', async () => {
    mockApi({
      ...regionApi,
      'GET /map/restaurants': fail(400, 'MAP_BOUNDS_TOO_LARGE', '지도를 더 확대해 주세요.'),
    });
    renderRoute('/');

    expect(await screen.findByText('지도를 더 확대해 주세요')).toBeInTheDocument();
  });

  it('핀을 누르면 가게 미리보기를 보여 주고, 미정복이면 방문 인증으로 갈 수 있다', async () => {
    const server = mockApi({
      ...regionApi,
      'GET /map/restaurants': ok({
        items: [pin(4, '이가네떡볶이', 'NOT_CONQUERED')],
        totalCount: 1,
        truncated: false,
        kakaoSynced: true,
      }),
      'GET /restaurants/:id/preview': ok({
        restaurantId: 4,
        name: '이가네떡볶이',
        categoryId: 5,
        categoryName: '분식',
        sigunguName: '강서구',
        dongName: '가양동',
        distanceM: null,
        rating: { score: 4.2, reviewCount: 86 },
        businessStatus: { isOpen: true, todayOpenTime: '11:00', todayCloseTime: '21:00' },
        currentSeasonConquerorCount: 12,
        conquestState: 'NOT_CONQUERED',
        conqueredInPastSeason: false,
        isSaved: false,
        myConquest: null,
        moving: null,
      }),
    });
    const { router } = renderRoute('/');

    fireEvent.click(await screen.findByRole('button', { name: '이가네떡볶이 (미정복)' }));
    const sheet = await screen.findByRole('dialog', { name: '가게 미리보기' });
    expect(await within(sheet).findByText('이번 시즌 12명이 정복했어요')).toBeInTheDocument();
    expect(within(sheet).getByText('분식 · 영업 중 · 21:00까지')).toBeInTheDocument();
    expect(server.calls('GET /restaurants/:id/preview')[0].path).toBe('/restaurants/4/preview');

    fireEvent.click(within(sheet).getByRole('button', { name: '방문 인증' }));
    expect(router.state.location.pathname).toBe('/visits/new');
    expect(router.state.location.search).toBe('?restaurantId=4');
  });

  it('지역 선택 시트에서 동네를 바꾸면 그 동네 지도를 다시 불러온다', async () => {
    const server = mockApi({
      ...regionApi,
      'GET /map/restaurants': ok({ items: [], totalCount: 0, truncated: false, kakaoSynced: true }),
    });
    renderRoute('/');

    fireEvent.click(await screen.findByRole('button', { name: /지역 바꾸기/ }));
    const sheet = screen.getByRole('dialog', { name: '지역 선택' });
    fireEvent.change(within(sheet).getByLabelText('동 이름 검색'), { target: { value: '망원' } });
    fireEvent.click(await within(sheet).findByRole('button', { name: /망원동.*서울/ }));
    fireEvent.click(within(sheet).getByRole('button', { name: '마포구 망원동으로 바꾸기' }));

    expect(
      await screen.findByRole('button', { name: '지역 바꾸기 (지금: 마포구 · 망원동)' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      const last = server.calls('GET /map/restaurants').at(-1)!.query;
      expect(Number(last.get('swLng'))).toBeGreaterThan(126.89);
    });
  });
});

describe('음식점 상세 (REST-01)', () => {
  it('기본 정보·항목별 평균·현지인 방문율을 보여 준다', async () => {
    mockApi({
      'GET /restaurants/:id': ok({
        restaurantId: 4,
        kakaoPlaceId: '1',
        name: '이가네떡볶이',
        status: 'A',
        categoryId: 5,
        categoryName: '분식',
        kakaoCategoryName: '분식',
        phone: '02-123-4567',
        roadAddress: '서울 강서구 가양로 12',
        jibunAddress: null,
        sigunguName: '강서구',
        dongName: '가양동',
        lat: 37.56,
        lng: 126.85,
        distanceM: null,
        kakaoPlaceUrl: 'https://place.map.kakao.com/1',
        businessHours: null,
        businessStatus: null,
        rating: { score: 4.2, reviewCount: 86 },
        stats: {
          taste: 4.6,
          cleanliness: 4.3,
          portion: null,
          service: 4.5,
          price: 4.2,
          revisitIntentRate: 81,
          localVisitRate: 72,
          revisitRate: 38,
          textReviewCount: 40,
          photoReviewCount: 20,
          visitCount: 128,
          currentSeasonConquerorCount: 12,
        },
        my: {
          conquestState: 'CONQUERED',
          conqueredInPastSeason: false,
          conqueredAt: '2026-09-14T12:00:00+09:00',
          myScore: 4.8,
          myReviewId: 9,
          movingVisitId: null,
          isSaved: false,
        },
      }),
    });
    const { router } = renderRoute('/restaurants/4');

    expect(await screen.findByRole('heading', { name: '이가네떡볶이' })).toBeInTheDocument();
    expect(screen.getByText('강서구 가양동 · 서울 강서구 가양로 12')).toBeInTheDocument();
    expect(screen.getByText('영업시간 정보가 아직 없어요')).toBeInTheDocument();
    expect(screen.getByText('현지인 방문 72% · 재방문 38%')).toBeInTheDocument();
    expect(screen.getByText('내 평가 ★ 4.8')).toBeInTheDocument();
    expect(screen.getByText('81%')).toBeInTheDocument();
    expect(screen.getByText('–')).toBeInTheDocument(); // 양 평가 없음

    fireEvent.click(screen.getByRole('button', { name: '내 리뷰 보기' }));
    expect(router.state.location.pathname).toBe('/reviews/9');
  });

  it('없는 가게면 안내한다', async () => {
    mockApi({
      'GET /restaurants/:id': fail(404, 'RESTAURANT_NOT_FOUND', '가게를 찾을 수 없어요.'),
    });
    renderRoute('/restaurants/999');

    expect(await screen.findByText('가게를 찾을 수 없어요')).toBeInTheDocument();
  });
});

describe('맛집 검색 (SEARCH-01·02)', () => {
  it('검색 홈에서 음식 종류를 누르면 그 종류로 찾고 최근 검색에 남긴다', async () => {
    const server = mockApi({
      ...regionApi,
      'GET /search/home': ok({
        region: GAYANG,
        categories: [
          { categoryId: 1, name: '한식', restaurantCount: 42 },
          { categoryId: 2, name: '중식', restaurantCount: 18 },
        ],
      }),
      'GET /restaurants/search': ok({
        items: [card(1, '옛날손칼국수', 'CONQUERED')],
        page: 1,
        size: 20,
        totalCount: 1,
        hasNext: false,
        emptyGuide: null,
      }),
    });
    const { router } = renderRoute('/search');

    expect(
      await screen.findByText('강서구 가양동에서 다음 정복 장소를 찾아보세요.'),
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /한식\s*42곳/ }));

    expect(await screen.findByText('강서구 가양동 한식 1곳')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?categoryId=1&category=%ED%95%9C%EC%8B%9D');
    const q = server.calls('GET /restaurants/search')[0].query;
    expect(q.get('categoryId')).toBe('1');
    expect(q.get('regionId')).toBe('11');
    expect(q.get('scope')).toBe('DONG');
    expect(q.get('sort')).toBe('LOCAL_POPULAR');
    expect(JSON.parse(localStorage.getItem('mk:recent-searches')!)).toEqual([
      { type: 'category', categoryId: 1, name: '한식' },
    ]);
  });

  it('검색어로 찾으면 메뉴로 찾은 가게에 메뉴 이름을 붙이고, 정렬을 바꿀 수 있다', async () => {
    const server = mockApi({
      ...regionApi,
      'GET /restaurants/search': ok({
        items: [{ ...card(2, '가양분식'), matchedBy: 'MENU', matchedMenuName: '칼국수' }],
        page: 1,
        size: 20,
        totalCount: 1,
        hasNext: false,
        emptyGuide: null,
      }),
    });
    renderRoute('/search?keyword=칼국수');

    expect(await screen.findByText('‘칼국수’ 검색 결과 1곳')).toBeInTheDocument();
    expect(screen.getByText('한식 · 410m · 메뉴: 칼국수')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '재방문 많음' }));
    await waitFor(() =>
      expect(server.calls('GET /restaurants/search').at(-1)!.query.get('sort')).toBe('REVISIT'),
    );

    // 위치가 없으면 가까운 순은 고를 수 없다
    fireEvent.click(screen.getByRole('radio', { name: '가까운 순' }));
    expect(
      await screen.findByText('가까운 순으로 보려면 위치 권한을 켜 주세요'),
    ).toBeInTheDocument();
  });

  it('결과가 없으면 구 전체로 넓히기와 비슷한 메뉴를 권한다', async () => {
    const server = mockApi({
      ...regionApi,
      'GET /restaurants/search': ({ query }) =>
        query.get('scope') === 'SIGUNGU'
          ? ok({
              items: [card(3, '마라공방')],
              page: 1,
              size: 20,
              totalCount: 1,
              hasNext: false,
              emptyGuide: null,
            })
          : ok(
              {
                items: [],
                page: 1,
                size: 20,
                totalCount: 0,
                hasNext: false,
                emptyGuide: { canSearchSigungu: true, similarKeywords: ['훠궈'] },
              },
              "'마라탕' 맛집을 찾지 못했어요.",
            ),
    });
    renderRoute('/search?keyword=마라탕');

    expect(await screen.findByText("'마라탕' 맛집을 찾지 못했어요.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '비슷한 메뉴: 훠궈' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '강서구 전체에서 찾기' }));

    expect(await screen.findByText('‘마라탕’ 검색 결과 1곳')).toBeInTheDocument();
    expect(server.calls('GET /restaurants/search').at(-1)!.query.get('scope')).toBe('SIGUNGU');
  });
});

describe('추천맛집 (RECO-01)', () => {
  it('추천 기준을 바꾸면 그 기준으로 다시 불러온다', async () => {
    const server = mockApi({
      ...regionApi,
      'GET /recommendations': ({ query }) =>
        ok({
          type: query.get('type'),
          region: {
            regionId: 11,
            level: 3,
            dongName: '가양동',
            sigunguId: 2,
            sigunguName: '강서구',
          },
          items: query.get('type') === 'RATING' ? [] : [card(1, '새맛집'), card(2, '옛날손칼국수')],
          page: 1,
          size: 5,
          totalCount: 2,
          hasNext: false,
        }),
    });
    renderRoute('/recommendations');

    expect(await screen.findByText('새맛집')).toBeInTheDocument();
    expect(screen.getAllByText('동네 주민이 자주 찾는 곳')).toHaveLength(2); // 카드마다
    expect(server.calls('GET /recommendations')[0].query.get('regionId')).toBe('11');

    fireEvent.click(screen.getByRole('radio', { name: '평점 높은 집' }));
    expect(await screen.findByText('아직 추천할 맛집이 없어요')).toBeInTheDocument();
    expect(server.calls('GET /recommendations').at(-1)!.query.get('type')).toBe('RATING');
  });
});
