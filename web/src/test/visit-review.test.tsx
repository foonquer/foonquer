import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
            topPercent: 11,
            tier: 'REGULAR',
            tierTitle: '강서구 단골',
          },
          rewards: { point: 100, levelUp: { from: 6, to: 7, itemBoxCount: 1 } },
          celebrations: {
            tierUp: { from: 'BEGINNER', to: 'REGULAR', tierTitle: '강서구 단골' },
            backgroundUnlocked: null,
            achievements: [],
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
    expect(screen.getByText('강서구 7위 · 강서구 단골 · 이번 시즌 8곳')).toBeInTheDocument();
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
