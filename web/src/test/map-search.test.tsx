import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import eggArt from '../assets/illust/mukkaebi-egg.svg';
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('홈 지도 (MAP-01·02)', () => {
  it('내 동네 중심으로 지도 영역의 가게를 불러와 핀으로 보여 준다', async () => {
    const server = mockApi({
      ...regionApi,
      'GET /map/restaurants': ok({
        items: [pin(1, '옛날손칼국수', 'CONQUERED'), pin(2, '이가네떡볶이', 'NOT_CONQUERED')],
        totalCount: 2,
        truncated: false,
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
    // 홈 지도는 내가 찜한 곳·정복한 곳만
    expect(q.get('mineOnly')).toBe('true');
  });

  it('홈 검색창을 누르고 들어가면 검색 입력칸에 바로 커서가 있다', async () => {
    mockApi({
      ...regionApi,
      'GET /map/restaurants': ok({ items: [], totalCount: 0, truncated: false }),
      'GET /search/home': ok({ region: GAYANG, categories: [] }),
    });
    renderRoute('/');
    fireEvent.click(await screen.findByRole('link', { name: '음식점 검색' }));
    expect(await screen.findByRole('searchbox', { name: '음식점·메뉴 검색' })).toHaveFocus();
  });

  it('찜하거나 정복한 가게가 없으면 지도에 안내를 띄운다', async () => {
    mockApi({
      ...regionApi,
      'GET /map/restaurants': ok({ items: [], totalCount: 0, truncated: false }),
    });
    renderRoute('/');

    expect(await screen.findByText('찜하거나 정복한 가게가 지도에 표시돼요')).toBeInTheDocument();
    // 안 읽은 알림이 없으면 점 없이 그냥 "알림"
    expect(screen.getByRole('link', { name: '알림' })).toBeInTheDocument();
  });

  it('프로필 줄에 레벨·대표 칭호를 보여 준다 (HOME-01)', async () => {
    mockApi({
      ...regionApi,
      'GET /map/restaurants': ok({ items: [], totalCount: 0, truncated: false }),
      'GET /home/summary': ok({
        mukkaebi: { level: 7, stage: 'BABY', stageName: '아기', equipped: {} },
        title: null,
        season: null,
        rank: { conquestCount: 16, main: { tierTitle: '강서구 단골' } },
        unreadNotificationCount: 2,
        celebrationCount: 0,
      }),
    });
    renderRoute('/');

    expect(await screen.findByText('LV.7')).toBeInTheDocument();
    expect(screen.getByText('강서구 단골')).toBeInTheDocument();
    // 안 읽은 알림이 있을 때만 빨간 점 (아이콘 그림에 점이 박혀 늘 켜져 있었다)
    expect(screen.getByRole('link', { name: '알림 (안 읽은 알림 2개)' })).toHaveAttribute(
      'href',
      '/notifications',
    );
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

  describe('핀이 아닌 곳을 누르면 그 자리에서 가장 가까운 음식점을 보여 준다', () => {
    const previewOf = (restaurantId: number, name: string) =>
      ok({
        restaurantId,
        name,
        categoryId: 1,
        categoryName: '한식',
        sigunguName: '강서구',
        dongName: '가양동',
        distanceM: null,
        rating: { score: null, reviewCount: 0 },
        businessStatus: null,
        currentSeasonConquerorCount: 0,
        conquestState: 'NOT_CONQUERED',
        conqueredInPastSeason: false,
        isSaved: false,
        myConquest: null,
        moving: null,
      });

    /** 홈 지도의 정가운데를 누른다 (간단한 지도: 화면 비율로 좌표를 구한다) */
    async function tapMapCenter() {
      const area = await screen.findByRole('region', { name: '동네 지도' });
      const map = area.firstElementChild as HTMLElement;
      vi.spyOn(map, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 400,
        height: 600,
        right: 400,
        bottom: 600,
        toJSON: () => ({}),
      });
      fireEvent.click(map, { clientX: 200, clientY: 300 });
    }

    /** 내 가게 핀(MAP-01 mineOnly)과 누른 자리의 가장 가까운 음식점(MAP-03) */
    const mapApi = (nearest: { restaurantId: number | null; placeName: string | null }) => ({
      'GET /map/restaurants': ok({
        items: [pin(9, '내가찜한집', 'NOT_CONQUERED')],
        totalCount: 1,
        truncated: false,
      }),
      'GET /map/nearest-restaurant': ok(nearest),
    });

    it('가장 가까운 음식점 1곳을 바로 미리보기. 반경은 보이는 지도 가로의 6%', async () => {
      const server = mockApi({
        ...regionApi,
        ...mapApi({ restaurantId: 5, placeName: '옆집국밥' }),
        'GET /restaurants/:id/preview': previewOf(5, '옆집국밥'),
      });
      renderRoute('/');
      await screen.findByRole('button', { name: '내가찜한집 (미정복)' });

      await tapMapCenter();

      const sheet = await screen.findByRole('dialog', { name: '가게 미리보기' });
      expect(await within(sheet).findByText('옆집국밥')).toBeInTheDocument();
      const [tap] = server.calls('GET /map/nearest-restaurant');
      expect(Number(tap.query.get('lat'))).toBeCloseTo(GAYANG.centerLat, 6);
      expect(Number(tap.query.get('lng'))).toBeCloseTo(GAYANG.centerLng, 6);
      // 지금 보이는 지도(MAP-01로 물은 영역) 가로 m의 6%, 20~100m
      const view = server.calls('GET /map/restaurants')[0].query;
      const widthM =
        (Number(view.get('neLng')) - Number(view.get('swLng'))) *
        111_320 *
        Math.cos((GAYANG.centerLat * Math.PI) / 180);
      const expected = Math.min(100, Math.max(20, Math.round(widthM * 0.06)));
      expect(Number(tap.query.get('radiusM'))).toBe(expected);
    });

    it('카카오 가게가 아직 우리 가게가 아니면 이름으로 알려 준다', async () => {
      mockApi({ ...regionApi, ...mapApi({ restaurantId: null, placeName: '골목포차' }) });
      renderRoute('/');
      await screen.findByRole('button', { name: '내가찜한집 (미정복)' });

      await tapMapCenter();
      expect(
        await screen.findByText('골목포차는 아직 먹장깨기에 없는 가게예요'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: '가게 미리보기' })).not.toBeInTheDocument();
    });

    it('없으면 안내하고, 핀을 누른 것은 지도를 누른 것으로 치지 않는다', async () => {
      const server = mockApi({
        ...regionApi,
        ...mapApi({ restaurantId: null, placeName: null }),
        'GET /restaurants/:id/preview': previewOf(9, '내가찜한집'),
      });
      renderRoute('/');

      fireEvent.click(await screen.findByRole('button', { name: '내가찜한집 (미정복)' }));
      await screen.findByRole('dialog', { name: '가게 미리보기' });
      expect(server.calls('GET /map/nearest-restaurant')).toHaveLength(0);

      await tapMapCenter();
      expect(await screen.findByText('이 자리에서 가게를 찾지 못했어요')).toBeInTheDocument();
    });

    /** 첫 번째 누르기 응답(지난집)은 release()까지 붙잡아 둔다. 가짜 서버는 취소된 요청에도 답한다 */
    function holdFirstTap() {
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const names: Record<number, string> = { 5: '지난집', 6: '새집', 9: '내가찜한집' };
      let taps = 0;
      mockApi({
        ...regionApi,
        ...mapApi({ restaurantId: null, placeName: null }),
        'GET /map/nearest-restaurant': async () => {
          taps += 1;
          if (taps > 1) return ok({ restaurantId: 6, placeName: '새집' });
          await held;
          return ok({ restaurantId: 5, placeName: '지난집' });
        },
        'GET /restaurants/:id/preview': ({ path }: { path: string }) => {
          const id = Number(path.split('/')[2]);
          return previewOf(id, names[id]);
        },
      });
      return release;
    }

    /** 붙잡아 둔 지난 응답을 보내고도 미리보기가 name 그대로인지 */
    async function expectPreviewStays(release: () => void, name: string) {
      const sheet = await screen.findByRole('dialog', { name: '가게 미리보기' });
      expect(await within(sheet).findByText(name)).toBeInTheDocument();
      release();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(within(sheet).getByText(name)).toBeInTheDocument();
      expect(screen.queryByText('지난집')).not.toBeInTheDocument();
    }

    it('다시 누르면 지난 누르기의 늦은 응답은 버린다', async () => {
      const release = holdFirstTap();
      renderRoute('/');
      await screen.findByRole('button', { name: '내가찜한집 (미정복)' });

      await tapMapCenter();
      await tapMapCenter();
      await expectPreviewStays(release, '새집');
    });

    it('응답을 기다리는 사이 핀을 고르면 늦은 응답은 버린다', async () => {
      const release = holdFirstTap();
      renderRoute('/');
      const myPin = await screen.findByRole('button', { name: '내가찜한집 (미정복)' });

      await tapMapCenter();
      fireEvent.click(myPin);
      await expectPreviewStays(release, '내가찜한집');
    });
  });

  describe('내 위치 먹깨비', () => {
    const ME = { latitude: 37.5501, longitude: 126.8402, accuracy: 10 };
    /** 브라우저 위치 흉내: 권한 상태와 watchPosition 결과 */
    function fakeLocation(
      permission: PermissionState,
      watch: (ok: (p: object) => void, fail: (e: object) => void) => void,
    ) {
      const clearWatch = vi.fn();
      Object.defineProperty(navigator, 'permissions', {
        configurable: true,
        value: { query: () => Promise.resolve({ state: permission }) },
      });
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          watchPosition: vi.fn((ok: (p: object) => void, fail: (e: object) => void) => {
            watch(ok, fail);
            return 1;
          }),
          clearWatch,
        },
      });
      return { clearWatch };
    }
    const homeApi = {
      ...regionApi,
      'GET /map/restaurants': ok({ items: [], totalCount: 0, truncated: false }),
      'GET /home/summary': ok({
        mukkaebi: { level: 1, stage: 'EGG', stageName: '알', equipped: {} },
        title: null,
        season: null,
        rank: { conquestCount: 0, main: null },
        unreadNotificationCount: 0,
        celebrationCount: 0,
      }),
    };

    afterEach(() => {
      Reflect.deleteProperty(navigator, 'permissions');
      Reflect.deleteProperty(navigator, 'geolocation');
    });

    it('위치를 이미 허용했으면 들어오자마자 내 위치에 먹깨비를 보여 주고, 떠나면 그만 받는다', async () => {
      const { clearWatch } = fakeLocation('granted', (ok) => ok({ coords: ME }));
      mockApi(homeApi);
      const { unmount } = renderRoute('/');

      expect(await screen.findByRole('img', { name: '내 위치 (내 먹깨비)' })).toBeInTheDocument();
      expect(screen.getByText('내 먹깨비')).toBeInTheDocument();
      // 아직 알이면 프로필 줄과 지도 모두 알 그림 (늘 다 큰 먹깨비가 아니라)
      const eggs = () => [...document.images].filter((img) => img.getAttribute('src') === eggArt);
      await waitFor(() => expect(eggs().length).toBeGreaterThan(1));
      unmount();
      expect(clearWatch).toHaveBeenCalled();
    });

    it('내 위치 버튼을 누르면 위치를 켜고 지도를 내 위치로 옮긴다', async () => {
      fakeLocation('prompt', (ok) => ok({ coords: ME }));
      const server = mockApi(homeApi);
      renderRoute('/');
      const button = await screen.findByRole('button', { name: '내 위치로 이동' });
      expect(screen.queryByText('내 먹깨비')).not.toBeInTheDocument();

      fireEvent.click(button);

      expect(await screen.findByText('내 먹깨비')).toBeInTheDocument();
      await waitFor(() => {
        const last = server.calls('GET /map/restaurants').at(-1)!.query;
        expect((Number(last.get('swLat')) + Number(last.get('neLat'))) / 2).toBeCloseTo(
          ME.latitude,
          6,
        );
      });
    });

    it('권한을 막았다가 허용하고 다시 누르면 위치를 새로 받는다', async () => {
      let calls = 0;
      fakeLocation('prompt', (ok, fail) => {
        calls += 1;
        if (calls === 1) fail({ code: 1, PERMISSION_DENIED: 1 });
        else ok({ coords: ME });
      });
      mockApi(homeApi);
      renderRoute('/');
      const button = await screen.findByRole('button', { name: '내 위치로 이동' });

      fireEvent.click(button);
      expect(await screen.findByText(/위치 권한이 꺼져 있어요/)).toBeInTheDocument();
      fireEvent.click(button);
      expect(await screen.findByText('내 먹깨비')).toBeInTheDocument();
      expect(calls).toBe(2);
    });

    it('위치 권한을 막았으면 켜는 방법을 알려 준다', async () => {
      fakeLocation('prompt', (_ok, fail) => fail({ code: 1, PERMISSION_DENIED: 1 }));
      mockApi(homeApi);
      renderRoute('/');

      fireEvent.click(await screen.findByRole('button', { name: '내 위치로 이동' }));
      expect(
        await screen.findByText(
          '위치 권한이 꺼져 있어요. 주소창 왼쪽 자물쇠에서 위치를 허용해 주세요',
        ),
      ).toBeInTheDocument();
    });
  });

  it('지역 선택 시트에서 동네를 바꾸면 그 동네 지도를 다시 불러온다', async () => {
    const server = mockApi({
      ...regionApi,
      'GET /map/restaurants': ok({ items: [], totalCount: 0, truncated: false }),
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
        categoryDetail: '김밥/만두/분식',
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
        myOverall: {
          score: 4.3,
          items: [
            { key: 'taste', average: 4.2, weightPercent: 30 },
            { key: 'cleanliness', average: 4.3, weightPercent: 30 },
            { key: 'portion', average: null, weightPercent: null },
            { key: 'service', average: 4.5, weightPercent: 20 },
            { key: 'price', average: 4.2, weightPercent: 20 },
          ],
        },
        hasMapae: true,
        stats: {
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
    // 주소의 "서울"을 빼고, 주소에 구 이름이 있으니 앞에는 동만
    expect(screen.getByText('가양동 · 강서구 가양로 12')).toBeInTheDocument();
    expect(screen.getByText('맛 별점')).toBeInTheDocument();
    // 맛 기준표: 4.2 → 4.0점대 "다른 사람에게 추천할 수 있는 맛"
    expect(
      screen.getByRole('button', { name: /4.0점대.*다른 사람에게 추천할 수 있는 맛/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '마패' })).toHaveTextContent(
      '리뷰 이벤트를 하는 가게입니다',
    );
    // 영업시간을 모르면 줄을 숨긴다
    expect(screen.queryByText(/영업시간/)).not.toBeInTheDocument();
    expect(screen.getByText('현지인 방문 72% · 재방문 38%')).toBeInTheDocument();
    expect(screen.getByText('내 평가 ★ 4.8')).toBeInTheDocument();
    expect(screen.getByText('81%')).toBeInTheDocument();
    expect(screen.getByText('–')).toBeInTheDocument(); // 양 평가 없음
    expect(screen.getByText('내 종합').previousSibling).toHaveTextContent('4.3');

    // 계산 보기: 항목 평균 × 내 비중
    fireEvent.click(screen.getByRole('button', { name: '계산 보기 ›' }));
    const sheet = await screen.findByRole('dialog', { name: '내 종합 별점' });
    expect(sheet).toHaveTextContent('4.2×0.3 + 4.3×0.3 + 4.5×0.2 + 4.2×0.2 = 4.3');
    fireEvent.click(within(sheet).getByRole('button', { name: '확인했어요' }));

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
        items: [{ ...card(1, '옛날손칼국수', 'CONQUERED'), categoryDetail: '국수/칼국수' }],
        page: 1,
        size: 20,
        totalCount: 1,
        hasNext: false,
        emptyGuide: null,
      }),
    });
    const { router } = renderRoute('/search');
    // 바로 들어오면(빈 화면의 "맛집 찾으러 가기" 등) 둘러보기라 입력칸에 커서를 두지 않는다. 추천맛집 버튼은 배너 하나만
    expect(await screen.findByRole('searchbox', { name: '음식점·메뉴 검색' })).not.toHaveFocus();
    expect(screen.queryByRole('link', { name: '추천맛집 둘러보기' })).not.toBeInTheDocument();

    expect(
      await screen.findByText('강서구 가양동에서 다음 정복 장소를 찾아보세요.'),
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /한식\s*42곳/ }));

    expect(await screen.findByText('강서구 가양동 한식 1곳')).toBeInTheDocument();
    // 같은 한식끼리도 무엇을 파는지 (업종 소분류)
    expect(screen.getByText(/한식 · 국수\/칼국수/)).toBeInTheDocument();
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
  it('추천할 곳이 없으면 동네 가게를 둘러보러 가는 길을 준다 (탭 화면이라 뒤로 가기는 없다)', async () => {
    mockApi({
      ...regionApi,
      'GET /recommendations': ok({
        items: [],
        preferredCategories: [],
        page: 1,
        size: 5,
        hasNext: false,
      }),
      'GET /map/restaurants': ok({
        items: [pin(3, '양천골황태', 'NOT_CONQUERED')],
        totalCount: 1,
        truncated: false,
      }),
    });
    renderRoute('/recommendations');

    expect(await screen.findByText('아직 추천할 맛집이 없어요')).toBeInTheDocument();
    // 대신 동 중심에서 가까운 동네 가게
    const nearby = await screen.findByRole('region', { name: '동네 가게' });
    expect(within(nearby).getByRole('link', { name: /양천골황태/ })).toHaveAttribute(
      'href',
      '/restaurants/3',
    );
    expect(screen.getByRole('link', { name: '검색으로 더 찾기' })).toHaveAttribute(
      'href',
      '/search',
    );
    expect(screen.queryByRole('button', { name: '뒤로 가기' })).not.toBeInTheDocument();
  });

  it('추천 기준을 바꾸면 그 기준으로 다시 불러온다', async () => {
    const server = mockApi({
      ...regionApi,
      'GET /recommendations': ({ query }) =>
        ok({
          type: query.get('type'),
          preferredCategories: [{ categoryId: 1, categoryName: '한식' }],
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
    expect(screen.getByText('좋아하는 한식 가게부터 보여 드려요.')).toBeInTheDocument();
    expect(screen.getAllByText('동네 주민이 자주 찾는 곳')).toHaveLength(2); // 카드마다
    expect(server.calls('GET /recommendations')[0].query.get('regionId')).toBe('11');

    fireEvent.click(screen.getByRole('radio', { name: '평점 높은 집' }));
    expect(await screen.findByText('아직 추천할 맛집이 없어요')).toBeInTheDocument();
    expect(server.calls('GET /recommendations').at(-1)!.query.get('type')).toBe('RATING');
  });
});
