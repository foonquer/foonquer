import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Review } from '../api/reviews';
import type { Verification } from '../api/visits';
import { parseExif } from '../lib/exif';
import { setMyCoordsForTest } from '../lib/useMyCoords';
import { fail, mockApi, ok } from './http';
import { renderRoute } from './render';

const UPLOAD = {
  'POST /uploads/signed-url': ok({
    uploadUrl: 'https://storage.test/upload',
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    imageKey: 'receipt/1/a.jpg',
    expiresIn: 300,
  }),
  'PUT /upload': ok(null),
};

const photo = (name = 'photo.jpg') => new File(['jpeg'], name, { type: 'image/jpeg' });

function verification(patch: Partial<Verification> = {}): Verification {
  return {
    verificationId: 31,
    method: 'RECEIPT',
    status: 'VERIFIED',
    failReason: null,
    failMessage: null,
    restaurant: { restaurantId: 7, name: '새맛집', categoryName: '한식' },
    receipt: {
      storeName: '새맛집',
      paidAt: '2026-09-25T12:34:00+09:00',
      totalAmount: 12000,
      storeNameMatched: true,
      businessNoMatched: true,
      items: [],
    },
    onSite: null,
    receiptImageUrl: null,
    sitePhotoUrl: null,
    isLocal: true,
    verifiedAt: '2026-09-25T12:40:00+09:00',
    expiresAt: null,
    isExpired: false,
    candidates: null,
    canRate: true,
    reviewId: null,
    ...patch,
  };
}

function review(patch: Partial<Review> = {}): Review {
  return {
    reviewId: 50,
    restaurant: {
      restaurantId: 7,
      name: '새맛집',
      categoryName: '한식',
      sigunguName: '강서구',
      dongName: '가양동',
    },
    author: {
      userId: 2,
      nickname: '동네탐험가',
      profileImageUrl: null,
      trustTemp: 42.3,
      title: '강서구 미식가',
      isLocal: true,
    },
    verificationMethod: 'RECEIPT',
    visitedAt: '2026-09-21T12:00:00+09:00',
    overallScore: 4.5,
    detailScores: null,
    aspects: [],
    content: null,
    imageUrls: [],
    imageCount: 0,
    helpfulCount: 12,
    myReaction: null,
    isMine: false,
    isRevisit: false,
    regDate: '2026-09-21T12:00:00+09:00',
    updatedAt: null,
    ...patch,
  };
}

beforeEach(() => {
  setMyCoordsForTest(null);
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

describe('방문 인증', () => {
  it('가게에서 들어오면 현장인증·영수증 인증 중에서 고른다', async () => {
    mockApi({});
    renderRoute('/visits/new?restaurantId=7');
    expect(await screen.findByText('어떻게 방문을 인증할까요?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /현장인증/ })).toHaveAttribute(
      'href',
      '/visits/new/on-site?restaurantId=7',
    );
    expect(screen.getByRole('link', { name: /영수증 인증/ })).toHaveAttribute(
      'href',
      '/visits/new/receipt?restaurantId=7',
    );
  });

  it('홈에서 바로 오면(가게 없음) 현장인증은 근처 가게 고르기로, 영수증 인증은 영수증 촬영으로', async () => {
    mockApi({});
    renderRoute('/visits/new');
    expect(await screen.findByText('어떻게 방문을 인증할까요?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /현장인증/ })).toHaveAttribute(
      'href',
      '/visits/new/on-site',
    );
    expect(screen.getByRole('link', { name: /영수증 인증/ })).toHaveAttribute(
      'href',
      '/visits/new/receipt',
    );
  });

  describe('홈에서 바로 현장인증', () => {
    const ME = { latitude: 37.5627, longitude: 126.8572, accuracy: 12 };
    /** 내 위치에서 북쪽 dLatM, 동쪽 dLngM 떨어진 가게 */
    const shop = (restaurantId: number, name: string, dLatM: number, dLngM: number) => ({
      restaurantId,
      name,
      categoryId: 1,
      categoryName: '한식',
      lat: ME.latitude + dLatM / 111_320,
      lng: ME.longitude + dLngM / (111_320 * Math.cos((ME.latitude * Math.PI) / 180)),
      conquestState: 'NOT_CONQUERED',
      conqueredInPastSeason: false,
      isSaved: false,
    });

    beforeEach(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: { getCurrentPosition: (done: (p: object) => void) => done({ coords: ME }) },
      });
    });
    // 단언이 실패해도 Date.now 등 스파이가 다음 테스트로 새지 않게
    afterEach(() => vi.restoreAllMocks());

    it('내 위치 100m 안 가게를 가까운 순으로 고르면, 그 위치로 바로 매장 위치를 확인한다', async () => {
      const server = mockApi({
        'GET /map/restaurants': ok({
          // 네모 모서리의 114m 가게는 빠진다
          items: [shop(7, '옆집국밥', 33, 0), shop(8, '2층카페', 0, 71), shop(9, '먼집', 89, 71)],
          totalCount: 3,
          truncated: false,
        }),
        'GET /restaurants/:id': ok({
          restaurantId: 8,
          name: '2층카페',
          categoryName: '카페',
          dongName: '가양동',
          lat: 37.5627,
          lng: 126.858,
        }),
        'POST /visit-verifications/location-checks': ok({
          verificationId: 41,
          restaurantId: 8,
          distanceM: 71,
          allowedM: 100,
          expiresAt: '2026-09-25T12:50:00+09:00',
        }),
      });
      const { router } = renderRoute('/visits/new');
      fireEvent.click(await screen.findByRole('link', { name: /현장인증/ }));
      fireEvent.click(await screen.findByRole('button', { name: '위치 권한 허용하기' }));

      const list = await screen.findByRole('radiogroup', { name: '지금 있는 가게' });
      const options = within(list).getAllByRole('radio');
      expect(options.map((o) => o.textContent)).toEqual([
        '옆집국밥한식 · 33m',
        '2층카페한식 · 71m',
      ]);
      expect(options[0]).toHaveAttribute('aria-checked', 'true');
      const [find] = server.calls('GET /map/restaurants');
      expect(find.query.has('mineOnly')).toBe(false);
      expect((Number(find.query.get('swLat')) + Number(find.query.get('neLat'))) / 2).toBeCloseTo(
        ME.latitude,
        6,
      );

      fireEvent.click(options[1]);
      fireEvent.click(screen.getByRole('button', { name: '2층카페에서 인증하기' }));

      expect(await screen.findByText('매장 위치 확인 완료')).toBeInTheDocument();
      expect(router.state.location.search).toBe('?restaurantId=8');
      expect(screen.queryByRole('button', { name: '위치 권한 허용하기' })).not.toBeInTheDocument();
      expect(server.calls('POST /visit-verifications/location-checks')).toHaveLength(1);
      expect(server.calls('POST /visit-verifications/location-checks')[0].body).toEqual({
        restaurantId: 8,
        lat: ME.latitude,
        lng: ME.longitude,
        accuracyM: 12,
      });
    });

    it('목록을 1분 넘게 보다 고르면 그때 잰 위치는 쓰지 않고 현장인증에서 다시 잰다', async () => {
      const server = mockApi({
        'GET /map/restaurants': ok({
          items: [shop(7, '옆집국밥', 33, 0)],
          totalCount: 1,
          truncated: false,
        }),
        'GET /restaurants/:id': ok({
          restaurantId: 7,
          name: '옆집국밥',
          lat: 37.563,
          lng: 126.857,
        }),
      });
      renderRoute('/visits/new/on-site');
      fireEvent.click(await screen.findByRole('button', { name: '위치 권한 허용하기' }));
      await screen.findByRole('radiogroup', { name: '지금 있는 가게' });

      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
      fireEvent.click(screen.getByRole('button', { name: '옆집국밥에서 인증하기' }));

      expect(
        await screen.findByText(
          '옆집국밥 근처에 있는지 확인할 수 있도록 위치 접근을 허용해주세요.',
        ),
      ).toBeInTheDocument();
      expect(server.calls('POST /visit-verifications/location-checks')).toHaveLength(0);
    });

    it('찾는 중에 화면을 떠나면 늦게 온 결과와 오류 안내를 버린다', async () => {
      let located: ((p: object) => void) | undefined;
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: { getCurrentPosition: (done: (p: object) => void) => (located = done) },
      });
      const server = mockApi({
        'GET /map/restaurants': fail(500, 'INTERNAL_ERROR', '서버 오류예요'),
      });
      const { router } = renderRoute('/visits/new/on-site');
      fireEvent.click(await screen.findByRole('button', { name: '위치 권한 허용하기' }));
      await act(() => router.navigate('/visits/new'));
      expect(await screen.findByText('어떻게 방문을 인증할까요?')).toBeInTheDocument();

      act(() => located?.({ coords: ME }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(server.calls('GET /map/restaurants')).toHaveLength(0);
      expect(screen.queryByText('서버 오류예요')).not.toBeInTheDocument();
    });

    it('위치 권한을 막았으면 켜는 방법을 알려 주고 다시 시도할 수 있다', async () => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (_done: unknown, fail: (e: object) => void) =>
            fail({ code: 1, PERMISSION_DENIED: 1 }),
        },
      });
      const server = mockApi({});
      renderRoute('/visits/new/on-site');
      fireEvent.click(await screen.findByRole('button', { name: '위치 권한 허용하기' }));

      expect(await screen.findByText('위치 권한이 꺼져 있어요')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '다시 시도하기' })).toBeEnabled();
      expect(server.calls('GET /map/restaurants')).toHaveLength(0);
    });

    it('가게를 못 불러오면 알려 주고 처음으로 돌아간다', async () => {
      mockApi({ 'GET /map/restaurants': fail(500, 'INTERNAL_ERROR', '서버 오류예요') });
      renderRoute('/visits/new/on-site');
      fireEvent.click(await screen.findByRole('button', { name: '위치 권한 허용하기' }));

      expect(await screen.findByText('서버 오류예요')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '위치 권한 허용하기' })).toBeEnabled();
    });

    it('100m 안에 가게가 없으면 알려 주고 다시 찾거나 검색할 수 있다', async () => {
      mockApi({ 'GET /map/restaurants': ok({ items: [], totalCount: 0, truncated: false }) });
      renderRoute('/visits/new/on-site');
      fireEvent.click(await screen.findByRole('button', { name: '위치 권한 허용하기' }));

      expect(await screen.findByText('100m 안에서 가게를 찾지 못했어요')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '다시 찾기' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /검색해서 직접 찾기/ })).toHaveAttribute(
        'href',
        '/search',
      );
    });
  });

  it('영수증을 찍어 올리면 읽는 중 → 인증 성공 → 별점 화면', async () => {
    let reads = 0;
    const server = mockApi({
      ...UPLOAD,
      'POST /visit-verifications/receipt': ok({ verificationId: 31, status: 'READING' }),
      'GET /visit-verifications/:id': () => {
        reads += 1;
        return ok(verification(reads === 1 ? { status: 'READING', restaurant: null } : {}));
      },
    });
    const { router } = renderRoute('/visits/new/receipt?restaurantId=7');

    fireEvent.change(await screen.findByLabelText('촬영'), { target: { files: [photo()] } });
    expect(await screen.findByText('글자가 잘 보이나요?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이 사진으로 인증하기' }));

    expect(await screen.findByText('영수증을 읽고 있어요')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/visits/31');
    expect(server.calls('POST /uploads/signed-url')[0].body).toEqual({
      purpose: 'RECEIPT',
      contentType: 'image/jpeg',
      fileSize: 4,
    });
    expect(server.calls('POST /visit-verifications/receipt')[0].body).toEqual({
      restaurantId: 7,
      receiptImageKey: 'receipt/1/a.jpg',
    });

    // 1.5초 뒤 다시 물어보면 인증 완료
    expect(
      await screen.findByText('방문 인증이 완료됐어요!', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('12,000원')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '별점 남기러 가기' }));
    expect(router.state.location.pathname).toBe('/visits/31/rating');
  });

  it('홈에서 찍은 영수증은 "이 가게가 맞나요?"에서 고른다 (VISIT-05)', async () => {
    let confirmed = false;
    const server = mockApi({
      'GET /visit-verifications/:id': () =>
        ok(
          confirmed
            ? verification()
            : verification({
                status: 'RESTAURANT_CHECK',
                restaurant: null,
                canRate: false,
                candidates: [
                  {
                    restaurantId: 7,
                    name: '새맛집',
                    categoryName: '한식',
                    roadAddress: '가양로 45',
                    distanceM: 120,
                    matchedBy: 'BUSINESS_NO',
                  },
                  {
                    restaurantId: 8,
                    name: '새맛집 마곡점',
                    categoryName: '한식',
                    roadAddress: null,
                    distanceM: 1800,
                    matchedBy: 'NAME',
                  },
                ],
              }),
        ),
      'POST /visit-verifications/:id/restaurant': () => {
        confirmed = true;
        return ok({ verificationId: 31, status: 'VERIFIED' });
      },
    });
    setMyCoordsForTest({ lat: 37.56, lng: 126.85 });
    renderRoute('/visits/31');

    // 결과는 위치 없이 먼저 묻고, 가게를 고를 때 위치로 다시 물어 가까운 순으로 받는다
    await waitFor(() =>
      expect(server.calls('GET /visit-verifications/:id').at(-1)?.query.get('lat')).toBe('37.56'),
    );
    expect(server.calls('GET /visit-verifications/:id')[0].query.get('lat')).toBeNull();
    expect(await screen.findByText('이 가게가 맞나요?')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /새맛집.*사업자번호 일치/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /새맛집 마곡점/ }));
    fireEvent.click(screen.getByRole('button', { name: '새맛집 마곡점이 맞아요' }));

    expect(await screen.findByText('방문 인증이 완료됐어요!')).toBeInTheDocument();
    expect(server.calls('POST /visit-verifications/:id/restaurant')[0].body).toEqual({
      restaurantId: 8,
    });
  });

  it('영수증을 1분 넘게 읽으면 그만 묻고 다시 시도를 보여 준다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const server = mockApi({
      'GET /visit-verifications/:id': ok(verification({ status: 'READING', restaurant: null })),
    });
    renderRoute('/visits/31');
    expect(await screen.findByText('영수증을 읽고 있어요')).toBeInTheDocument();
    for (let i = 0; i < 40; i++) await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(await screen.findByText('영수증을 읽는 데 시간이 오래 걸려요')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(server.calls('GET /visit-verifications/:id')).toHaveLength(41);
    vi.useRealTimers();
  });

  it('이미 인증한 영수증이면 이유와 다음 행동을 알려 준다', async () => {
    mockApi({
      'GET /visit-verifications/:id': ok(
        verification({ status: 'FAILED', failReason: 'DUPLICATE', canRate: false }),
      ),
    });
    const { router } = renderRoute('/visits/31');
    expect(await screen.findByText('이미 인증한 영수증이에요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다른 영수증 촬영하기' }));
    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/visits/new/receipt?restaurantId=7',
    );
  });

  it('홈에서 찍은 영수증이 실패하면 다시 찍기는 바로 영수증 촬영으로', async () => {
    mockApi({
      'GET /visit-verifications/:id': ok(
        verification({
          status: 'FAILED',
          failReason: 'DUPLICATE',
          canRate: false,
          restaurant: null,
        }),
      ),
    });
    const { router } = renderRoute('/visits/31');
    fireEvent.click(await screen.findByRole('button', { name: '다른 영수증 촬영하기' }));
    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/visits/new/receipt',
    );
  });

  describe('화면 안 카메라', () => {
    /** 브라우저 카메라 흉내: 권한 상태와 getUserMedia 결과 */
    function fakeCamera(permission: PermissionState, getUserMedia: () => Promise<MediaStream>) {
      const media = { getUserMedia: vi.fn(getUserMedia) };
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: media });
      Object.defineProperty(navigator, 'permissions', {
        configurable: true,
        value: { query: () => Promise.resolve({ state: permission }) },
      });
      return media;
    }
    const blocked = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));

    afterEach(() => {
      Reflect.deleteProperty(navigator, 'mediaDevices');
      Reflect.deleteProperty(navigator, 'permissions');
    });

    it('처음이면 권한 안내 → 막히면 꺼짐 안내, 다시 시도해도 막혀 있으면 알려 준다', async () => {
      const media = fakeCamera('prompt', blocked);
      renderRoute('/visits/new/receipt?restaurantId=7');

      expect(await screen.findByText('카메라를 켜도 될까요?')).toBeInTheDocument();
      expect(screen.getByText('가게명·날짜·금액만 확인해요')).toBeInTheDocument();
      expect(media.getUserMedia).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: '카메라 허용하기' }));

      expect(await screen.findByText('카메라 권한이 꺼져 있어요')).toBeInTheDocument();
      expect(screen.getByText('2. 카메라를 ‘허용’으로 바꾸기')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
      expect(await screen.findByText('아직 카메라가 꺼져 있어요')).toBeInTheDocument();
      expect(media.getUserMedia).toHaveBeenCalledTimes(2);

      // 앨범에서 고르면 그대로 촬영 확인으로
      fireEvent.change(screen.getByLabelText('앨범에서 사진 고르기'), {
        target: { files: [photo()] },
      });
      expect(await screen.findByText('글자가 잘 보이나요?')).toBeInTheDocument();
    });

    it('이미 허용했으면 바로 카메라를 켜고, 화면을 떠나면 끈다', async () => {
      const stop = vi.fn();
      const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
      const media = fakeCamera('granted', () => Promise.resolve(stream));
      const { unmount } = renderRoute('/visits/new/receipt?restaurantId=7');

      expect(await screen.findByRole('button', { name: '촬영' })).toBeEnabled();
      expect(screen.getByLabelText('카메라 화면')).toBeInTheDocument();
      expect(media.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({ video: expect.objectContaining({ facingMode: 'environment' }) }),
      );
      unmount();
      expect(stop).toHaveBeenCalled();
    });

    it('권한을 확인하는 중에 앨범에서 고르면 카메라를 켜지 않고, 다시 촬영하면 권한 확인부터 다시 한다', async () => {
      let answer: (state: PermissionState) => void = () => undefined;
      const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
      const media = { getUserMedia: vi.fn(() => Promise.resolve(stream)) };
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: media });
      const query = vi.fn(
        () =>
          new Promise<{ state: PermissionState }>((resolve) => {
            answer = (state) => resolve({ state });
          }),
      );
      Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } });
      renderRoute('/visits/new/receipt?restaurantId=7');

      fireEvent.change(await screen.findByLabelText('앨범'), { target: { files: [photo()] } });
      expect(await screen.findByText('글자가 잘 보이나요?')).toBeInTheDocument();
      await act(async () => answer('granted'));
      expect(media.getUserMedia).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: '다시 촬영' }));
      await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
      await act(async () => answer('granted'));
      expect(await screen.findByRole('button', { name: '촬영' })).toBeEnabled();
      expect(media.getUserMedia).toHaveBeenCalledTimes(1);
    });

    it('켜는 중에 앨범에서 고르면 늦게 켜진 카메라는 바로 끄고, 다시 촬영하면 새로 켠다', async () => {
      const stop = vi.fn();
      const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
      let turnOn: (s: MediaStream) => void = () => undefined;
      const media = fakeCamera(
        'granted',
        () =>
          new Promise<MediaStream>((resolve) => {
            turnOn = resolve;
          }),
      );
      renderRoute('/visits/new/receipt?restaurantId=7');

      expect(await screen.findByRole('button', { name: '카메라를 켜는 중…' })).toBeDisabled();
      fireEvent.change(screen.getByLabelText('앨범'), { target: { files: [photo()] } });
      expect(await screen.findByText('글자가 잘 보이나요?')).toBeInTheDocument();

      await act(async () => turnOn(stream));
      expect(stop).toHaveBeenCalled();
      expect(screen.getByText('글자가 잘 보이나요?')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '다시 촬영' }));
      await waitFor(() => expect(media.getUserMedia).toHaveBeenCalledTimes(2));
    });
  });

  it('현장인증: 위치 확인 → 음식 사진 → 정복하기 → 먹깨비 따라가기', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (done: (p: object) => void) =>
          done({ coords: { latitude: 37.5627, longitude: 126.8572, accuracy: 12 } }),
      },
    });
    const server = mockApi({
      ...UPLOAD,
      'GET /restaurants/:id': ok({
        restaurantId: 7,
        name: '새맛집',
        categoryName: '한식',
        dongName: '가양동',
        lat: 37.5628,
        lng: 126.8571,
      }),
      'POST /visit-verifications/location-checks': ok({
        verificationId: 40,
        restaurantId: 7,
        distanceM: 42,
        allowedM: 100,
        expiresAt: '2026-09-25T12:50:00+09:00',
      }),
      'POST /visit-verifications/:id/on-site': ok({
        verificationId: 40,
        status: 'VERIFIED',
        restaurant: { restaurantId: 7, name: '새맛집' },
        reward: { point: 50, levelUp: null },
      }),
      'GET /visit-verifications/:id': ok(verification({ verificationId: 40, method: 'ON_SITE' })),
    });
    const { router } = renderRoute('/visits/new/on-site?restaurantId=7');

    fireEvent.click(await screen.findByRole('button', { name: '위치 권한 허용하기' }));
    expect(await screen.findByText('매장 위치 확인 완료')).toBeInTheDocument();
    expect(screen.getByText('매장에서 42m · 인증 범위 100m 이내')).toBeInTheDocument();
    expect(server.calls('POST /visit-verifications/location-checks')[0].body).toEqual({
      restaurantId: 7,
      lat: 37.5627,
      lng: 126.8572,
      accuracyM: 12,
    });
    fireEvent.click(screen.getByRole('button', { name: '위치 확인하고 다음으로' }));

    fireEvent.change(screen.getByLabelText(/탭해서 갤러리에서 사진을 골라주세요/), {
      target: { files: [photo()] },
    });
    fireEvent.click(await screen.findByRole('button', { name: '이 사진 사용하기' }));
    fireEvent.click(await screen.findByRole('button', { name: '새맛집 정복하기' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/visits/40/follow'));
    expect(server.calls('POST /visit-verifications/:id/on-site')[0].body).toEqual({
      sitePhotoKey: 'receipt/1/a.jpg',
    });
    expect(await screen.findByText(/새맛집까지 이동 중|새맛집 도착!/)).toBeInTheDocument();
  });

  it('매장에서 멀면 거리를 알려 주고 다시 확인할 수 있다', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (done: (p: object) => void) =>
          done({ coords: { latitude: 37.56, longitude: 126.85, accuracy: 20 } }),
      },
    });
    mockApi({
      'GET /restaurants/:id': ok({ restaurantId: 7, name: '새맛집', lat: 37.5, lng: 126.8 }),
      'POST /visit-verifications/location-checks': fail(422, 'VISIT_TOO_FAR', '멀어요', {
        distanceM: 180,
        allowedM: 100,
      }),
    });
    renderRoute('/visits/new/on-site?restaurantId=7');
    fireEvent.click(await screen.findByRole('button', { name: '위치 권한 허용하기' }));
    expect(await screen.findByText('아직 매장 근처가 아니에요')).toBeInTheDocument();
    expect(screen.getByText(/현재 180m · 매장 100m 이내에서/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '매장 위치 다시 확인' })).toBeInTheDocument();
  });
});

describe('별점 → 정복 → 세부평가 → 적립', () => {
  it('맛 별점을 고르면 정복하고, 세부평가를 남기면 포인트를 받는다', async () => {
    let rated = false;
    const server = mockApi({
      'GET /visit-verifications/:id': () =>
        ok(verification(rated ? { status: 'CONQUERED', canRate: false, reviewId: 50 } : {})),
      'POST /visits/:id/rating': () => {
        rated = true;
        return ok({
          reviewId: 50,
          visitId: 31,
          overallScore: 4.5,
          restaurant: { restaurantId: 7, name: '새맛집' },
          conquest: {
            isNewConquest: true,
            isFirstEver: true,
            sigunguId: 3,
            sigunguName: '강서구',
            conquestCount: 8,
            rank: 7,
            previousRank: 8,
            topPercent: 11,
            tier: 'REGULAR',
            tierTitle: '강서구 단골',
            nextTier: { tierName: '미식가', remaining: 12 },
          },
          rewards: { point: 100, levelUp: { from: 6, to: 7, itemBoxCount: 1 } },
          celebrations: {
            tierUp: { from: 'BEGINNER', to: 'REGULAR', tierTitle: '강서구 단골' },
            backgroundUnlocked: null,
            achievements: [],
          },
          nextReward: {
            achievementId: 10,
            name: '한 시즌 30곳 정복',
            conditionType: 'SEASON_CONQUEST',
            current: 8,
            target: 30,
            remaining: 22,
            rewardPoint: 300,
            rewardItems: [{ itemId: 28, code: 'CLUB_GOLD', name: '황금 방망이' }],
          },
        });
      },
      'GET /reviews/:id': ok(review({ isMine: true })),
      'GET /review-aspects': ok({
        items: [
          { aspectId: 1, code: 'TASTE', name: '맛' },
          { aspectId: 7, code: 'WAIT', name: '대기시간' },
        ],
      }),
      'POST /visits/:id/review': ok({
        review: review(),
        rewards: { point: 50, levelUp: null },
        achievements: [],
      }),
      'GET /points/me': ok({ pointBalance: 1330, monthEarned: 300, monthSpent: 0 }),
    });
    const { router } = renderRoute('/visits/31/rating');

    expect(await screen.findByText('음식 맛은 어땠나요?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이 별점으로 정복하기' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '4.5점' }));
    expect(screen.getByText('4.5 · 기다릴 가치가 있는 맛')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '맛 기준표 보기 ›' }));
    expect(
      within(screen.getByRole('dialog', { name: '먹장깨기 맛 기준' })).getByText(
        '3.0↑ 다시 먹을 의향 · 2.5↓ 재방문 의사 없음',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '확인했어요' }));
    fireEvent.click(screen.getByRole('button', { name: '이 별점으로 정복하기' }));

    expect(await screen.findByText('새맛집, 정복 완료!')).toBeInTheDocument();
    expect(server.calls('POST /visits/:id/rating')[0].body).toEqual({ overallScore: 4.5 });
    expect(screen.getByText('강서구 8위 → 7위 · 미식가까지 12곳')).toBeInTheDocument();
    const next = screen.getByRole('region', { name: '다음 정복 보상' });
    expect(within(next).getByText('황금 방망이')).toBeInTheDocument();
    expect(within(next).getByText('22곳만 더 정복하면 내 것이 돼요!')).toBeInTheDocument();
    expect(within(next).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '8');
    expect(within(next).getByText('한 시즌에 정복 8곳')).toBeInTheDocument();
    expect(within(next).getByText('30곳 달성 시 해금')).toBeInTheDocument();
    expect(screen.getByText('강서구 단골이 됐어요')).toBeInTheDocument();
    expect(screen.getByText('먹깨비 Lv.6 → Lv.7')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '세부평가 남기고 포인트 쌓기' }));

    expect(await screen.findByText('맛 말고 다른 점도 알려주세요')).toBeInTheDocument();
    expect(screen.getByText('새맛집 · 가양동 한식 · 맛 ★ 4.5')).toBeInTheDocument();
    // 세부 별점을 일부만 고르면 등록할 수 없다
    fireEvent.click(
      within(screen.getByRole('slider', { name: '청결 별점' })).getByRole('button', {
        name: '4점',
      }),
    );
    expect(screen.getByText('세부 별점은 네 항목을 모두 골라 주세요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '등록하고 포인트 적립' })).toBeDisabled();
    for (const label of ['양 별점', '서비스 별점', '가격 만족도 별점']) {
      fireEvent.click(
        within(screen.getByRole('slider', { name: label })).getByRole('button', { name: '5점' }),
      );
    }
    // 한 번 누르면 좋았던 점, 두 번 누르면 아쉬웠던 점
    fireEvent.click(screen.getByRole('button', { name: '맛 고르지 않음' }));
    fireEvent.click(screen.getByRole('button', { name: '대기시간 고르지 않음' }));
    fireEvent.click(screen.getByRole('button', { name: '대기시간 좋음' }));
    fireEvent.change(screen.getByLabelText('세부 리뷰 (선택)'), {
      target: { value: '국물이 진하고 양이 넉넉했어요.' },
    });
    expect(screen.getByText('17 / 300')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '등록하고 포인트 적립' }));

    expect(await screen.findByText('먹포인트 +50P 받았어요!')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/visits/31/reward');
    expect(server.calls('POST /visits/:id/review')[0].body).toEqual({
      detailScores: { cleanliness: 4, portion: 5, service: 5, price: 5 },
      aspects: [
        { aspectId: 1, polarity: 'G' },
        { aspectId: 7, polarity: 'B' },
      ],
      content: '국물이 진하고 양이 넉넉했어요.',
    });
    expect(await screen.findByText('1,280P → 1,330P')).toBeInTheDocument();
  });
});

describe('리뷰', () => {
  it('가게 리뷰 목록에서 도움돼요를 누르고 다시 누르면 취소한다', async () => {
    const server = mockApi({
      'GET /restaurants/:id': fail(500, 'X'),
      'GET /restaurants/:id/reviews': ok({
        items: [
          review({
            detailScores: { cleanliness: 4, portion: 5, service: 5, price: 4 },
            content: '정식이 든든해요.',
          }),
        ],
        page: 1,
        size: 10,
        totalCount: 1,
        hasNext: false,
      }),
      'PUT /reviews/:id/reaction': ok({ reviewId: 50, myReaction: 'HELPFUL', helpfulCount: 13 }),
      'DELETE /reviews/:id/reaction': ok({ reviewId: 50, myReaction: null, helpfulCount: 12 }),
    });
    renderRoute('/restaurants/7/reviews');

    const card = await screen.findByRole('article', { name: '동네탐험가의 리뷰' });
    expect(card).toHaveTextContent('청결 4 · 양 5 · 서비스 5 · 가격 4');
    expect(card).toHaveTextContent('재방문 의사 있음');
    fireEvent.click(within(card).getByRole('button', { name: '도움돼요 12' }));
    expect(await within(card).findByRole('button', { name: '도움돼요 13' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(server.calls('PUT /reviews/:id/reaction')[0].body).toEqual({ type: 'HELPFUL' });
    fireEvent.click(within(card).getByRole('button', { name: '도움돼요 13' }));
    expect(await within(card).findByRole('button', { name: '도움돼요 12' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    fireEvent.change(screen.getByRole('combobox', { name: '정렬' }), {
      target: { value: 'SCORE_LOW' },
    });
    await waitFor(() =>
      expect(server.calls('GET /restaurants/:id/reviews').at(-1)?.query.get('sort')).toBe(
        'SCORE_LOW',
      ),
    );

    // 재방문 의사 있음 = 맛 별점 3.0 이상만
    fireEvent.click(screen.getByRole('radio', { name: '재방문 의사 있음' }));
    await waitFor(() =>
      expect(server.calls('GET /restaurants/:id/reviews').at(-1)?.query.get('revisitOnly')).toBe(
        'true',
      ),
    );
  });

  it('내 리뷰를 고치면 바뀐 별점과 사진을 보내고, 삭제하면 세부평가만 지운다', async () => {
    const mine = review({
      isMine: true,
      detailScores: { cleanliness: 4, portion: 4, service: 5, price: 4 },
      content: '맛있어요',
      imageUrls: ['https://img.test/review/1/a.jpg'],
      imageCount: 1,
    });
    const server = mockApi({
      'GET /reviews/:id': ok(mine),
      'GET /review-aspects': ok({ items: [] }),
      'PATCH /reviews/:id': ok({ review: mine, rewards: { point: 0, levelUp: null } }),
      'DELETE /reviews/:id': ok({ reviewId: 50, overallScore: 4.5, detailDeleted: true }),
    });
    const { router } = renderRoute('/reviews/50/edit');

    fireEvent.click(
      within(await screen.findByRole('slider', { name: '맛 별점' })).getByRole('button', {
        name: '3.5점',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/reviews/50'));
    expect(server.calls('PATCH /reviews/:id')[0].body).toEqual({
      overallScore: 3.5,
      detailScores: { cleanliness: 4, portion: 4, service: 5, price: 4 },
      aspects: [],
      content: '맛있어요',
    });

    await router.navigate('/reviews/50/edit');
    fireEvent.click(await screen.findByRole('button', { name: '사진 1 빼기' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog', { name: '리뷰를 삭제할까요?' })).getByRole('button', {
        name: '삭제',
      }),
    );
    await waitFor(() => expect(server.calls('DELETE /reviews/:id')).toHaveLength(1));
  });
});

describe('내 취향 설정', () => {
  it('보통·중요·아주 중요를 고르면 비중을 바로 보여 주고 저장한다', async () => {
    const server = mockApi({
      'GET /users/me/taste-weights': ok({
        items: ['taste', 'cleanliness', 'portion', 'service', 'price'].map((key) => ({
          key,
          level: 'NORMAL',
          weightPercent: 20,
        })),
      }),
      'PUT /users/me/taste-weights': ok({ items: [] }, '내 취향을 저장했어요.'),
    });
    renderRoute('/me/taste');
    const save = await screen.findByRole('button', { name: '저장하기' });
    expect(save).toBeDisabled();
    for (const [item, level] of [
      ['맛', '아주 중요'],
      ['청결', '아주 중요'],
      ['가격', '중요'],
    ]) {
      fireEvent.click(
        within(screen.getByRole('radiogroup', { name: `${item} 중요도` })).getByRole('radio', {
          name: level,
        }),
      );
    }
    expect(
      screen.getByText('맛 30% · 청결 30% · 가격 20% · 양 10% · 서비스 10%'),
    ).toBeInTheDocument();
    expect(screen.getByText('예) 새맛집 — 맛 별점 ★ 4.4 → 내 종합 ★ 4.3')).toBeInTheDocument();
    fireEvent.click(save);
    await waitFor(() => expect(server.calls('PUT /users/me/taste-weights')).toHaveLength(1));
    expect(server.calls('PUT /users/me/taste-weights')[0].body).toEqual({
      taste: 'VERY',
      cleanliness: 'VERY',
      portion: 'NORMAL',
      service: 'NORMAL',
      price: 'IMPORTANT',
    });
  });
});

describe('parseExif', () => {
  /** SOI + APP1(Exif) + TIFF(II) — IFD0에 Exif·GPS 포인터, 촬영 시각과 위도·경도 */
  function jpegWithExif() {
    const tiff: number[] = [];
    const u16 = (v: number) => tiff.push(v & 0xff, v >> 8);
    const u32 = (v: number) => tiff.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24);
    /** IFD 항목: 값이 4바이트 안이면 그 자리에(bytes), 아니면 값이 있는 offset */
    const entry = (tag: number, type: number, count: number, value: number | number[]) => {
      u16(tag);
      u16(type);
      u32(count);
      if (typeof value === 'number') u32(value);
      else tiff.push(...value);
    };
    // 헤더
    tiff.push(0x49, 0x49);
    u16(42);
    u32(8);
    // IFD0 (offset 8): 2개 항목
    u16(2);
    entry(0x8769, 4, 1, 38); // Exif IFD
    entry(0x8825, 4, 1, 76); // GPS IFD
    u32(0);
    // Exif IFD (offset 38): DateTimeOriginal (ASCII 20) → 값은 offset 56
    u16(1);
    entry(0x9003, 2, 20, 56);
    u32(0);
    for (const c of '2026:09:25 12:34:56\0') tiff.push(c.charCodeAt(0));
    // GPS IFD (offset 76): N, 위도, E, 경도 → 유리수는 offset 130, 154
    u16(4);
    entry(1, 2, 2, [0x4e, 0, 0, 0]);
    entry(2, 5, 3, 130);
    entry(3, 2, 2, [0x45, 0, 0, 0]);
    entry(4, 5, 3, 154);
    u32(0);
    for (const [n, d] of [
      [37, 1],
      [33, 1],
      [4572, 100],
      [126, 1],
      [51, 1],
      [2592, 100],
    ]) {
      u32(n);
      u32(d);
    }
    const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const length = exif.length + 2;
    return new DataView(
      new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...exif]).buffer,
    );
  }

  it('촬영 시각(한국 시간)과 GPS 위치를 읽는다', () => {
    expect(parseExif(jpegWithExif())).toEqual({
      takenAt: '2026-09-25T12:34:56+09:00',
      lat: 37.5627,
      lng: 126.8572,
    });
  });

  it('JPEG가 아니거나 EXIF가 없으면 빈 값', () => {
    expect(parseExif(new DataView(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer))).toEqual({});
    expect(parseExif(new DataView(new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0, 2]).buffer))).toEqual(
      {},
    );
  });
});
