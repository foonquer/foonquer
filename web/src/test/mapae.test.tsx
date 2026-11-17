import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapaeReport } from '../api/mapae';
import type { RestaurantDetail } from '../api/restaurants';
import { fail, mockApi, ok } from './http';
import { renderRoute } from './render';

const SHOP = { lat: 37.56, lng: 126.85 };

const detail = (patch: Partial<RestaurantDetail> = {}): RestaurantDetail =>
  ({
    restaurantId: 4,
    kakaoPlaceId: null,
    name: '이벤트식당',
    status: 'A',
    categoryId: 5,
    categoryName: '분식',
    categoryDetail: null,
    phone: null,
    roadAddress: '서울 강서구 가양로 12',
    jibunAddress: null,
    sigunguName: '강서구',
    dongName: '가양동',
    ...SHOP,
    distanceM: null,
    kakaoPlaceUrl: null,
    businessHours: null,
    businessStatus: null,
    imageUrl: null,
    rating: { score: 4.2, reviewCount: 86 },
    myOverall: { score: null, items: [] },
    hasMapae: false,
    stats: {
      cleanliness: null,
      portion: null,
      service: null,
      price: null,
      revisitIntentRate: null,
      revisitIntentCount: 0,
      localVisitRate: null,
      revisitRate: null,
      textReviewCount: 0,
      photoReviewCount: 0,
      visitCount: 0,
      currentSeasonConquerorCount: 0,
    },
    my: {
      conquestState: 'NOT_CONQUERED',
      conqueredInPastSeason: false,
      conqueredAt: null,
      myScore: null,
      myReviewId: null,
      movingVisitId: null,
      isSaved: false,
    },
    ...patch,
  }) as RestaurantDetail;

const report = (patch: Partial<MapaeReport> = {}): MapaeReport => ({
  reportId: 12,
  restaurantId: 4,
  restaurantName: '이벤트식당',
  eventType: 'STAR5',
  status: 'PENDING',
  distanceM: 22,
  hasVisit: false,
  reporterCount: 1,
  reportersNeeded: 2,
  rewardPoint: 0,
  regDate: '2026-11-17T15:00:00+09:00',
  ...patch,
});

/** 기기가 잰 지금 위치 (가게에서 dLat만큼 북쪽) */
function fakeHere(dLat: number) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (done: (p: object) => void) =>
        done({
          coords: { latitude: SHOP.lat + dLat, longitude: SHOP.lng, accuracy: 10 },
          timestamp: Date.now(),
        }),
    },
  });
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
});

describe('음식점 상세의 마패 입구', () => {
  it('마패가 없으면 제보하기, 방문자 제보로 붙은 마패면 제보 건수와 사장님 이의제기', async () => {
    mockApi({ 'GET /restaurants/:id': ok(detail()) });
    const first = renderRoute('/restaurants/4');
    expect(await screen.findByRole('link', { name: /리뷰 이벤트 안내를 봤나요/ })).toHaveAttribute(
      'href',
      '/restaurants/4/mapae-report',
    );
    first.unmount();

    mockApi({ 'GET /restaurants/:id': ok(detail({ hasMapae: true, mapaeReportCount: 2 })) });
    renderRoute('/restaurants/4');
    const mapae = await screen.findByRole('region', { name: '마패' });
    expect(mapae).toHaveTextContent(
      '리뷰 이벤트 제보가 확인된 가게예요 · 방문자 사진 제보 2건 · 위치 확인 완료',
    );
    expect(within(mapae).getByRole('link', { name: '사장님이신가요? 이의제기 ›' })).toHaveAttribute(
      'href',
      '/restaurants/4/mapae-objection',
    );
    expect(screen.queryByRole('link', { name: /리뷰 이벤트 안내를 봤나요/ })).toBeNull();
  });
});

describe('마패 제보 (MAPAE-01·02)', () => {
  it('가게 근처에서 오늘 찍은 사진·이벤트 종류를 보내면 접수 현황(1건 더 필요해요)으로', async () => {
    fakeHere(0.0002);
    const server = mockApi({
      'GET /restaurants/:id': ok(detail()),
      'POST /uploads/signed-url': ok({
        uploadUrl: 'https://storage.test/upload',
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        imageKey: 'mapae/1/a.jpg',
        expiresIn: 300,
      }),
      'PUT /upload': ok(null),
      'POST /restaurants/:id/mapae-reports': ok(report()),
    });
    const { router } = renderRoute('/restaurants/4/mapae-report');

    const checks = await screen.findByRole('region', { name: '자동 확인' });
    expect(await within(checks).findByText('가게에서 22m')).toBeInTheDocument();
    expect(checks).toHaveTextContent('방문 기록이 없어도 제보할 수 있어요');
    const send = screen.getByRole('button', { name: '제보하기' });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByTestId('mapae-photo-input'), {
      target: { files: [new File(['jpeg'], 'notice.jpg', { type: 'image/jpeg' })] },
    });
    expect(await screen.findByAltText('찍은 안내문 사진')).toBeInTheDocument();
    expect(checks).toHaveTextContent('오늘 찍은 사진이에요');
    expect(send).toBeDisabled(); // 이벤트 종류를 아직 안 골랐다
    fireEvent.click(screen.getByRole('radio', { name: '별점 5점 조건' }));
    fireEvent.change(screen.getByLabelText('안내 문구 (선택)'), {
      target: { value: '별점 5점 주면 음료 서비스' },
    });
    fireEvent.click(send);

    expect(await screen.findByText('제보가 접수됐어요')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/mapae-reports/12');
    expect(server.calls('POST /uploads/signed-url')[0].body).toMatchObject({ purpose: 'MAPAE' });
    expect(server.calls('POST /restaurants/:id/mapae-reports')[0].body).toEqual({
      eventType: 'STAR5',
      memo: '별점 5점 주면 음료 서비스',
      photoKey: 'mapae/1/a.jpg',
      lat: SHOP.lat + 0.0002,
      lng: SHOP.lng,
    });
    const steps = screen.getByRole('list', { name: '처리 단계' });
    expect(steps).toHaveTextContent('가게에서 22m · 확인 완료');
    expect(steps).toHaveTextContent('지금 1건 · 1건 더 필요해요');
    expect(screen.getByText('마패가 확정되면 제보자에게 +50P')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '가게로 돌아가기' })).toHaveAttribute(
      'href',
      '/restaurants/4',
    );
  });

  it('가게에서 멀면 보낼 수 없고, 오래된 사진도 막는다', async () => {
    fakeHere(0.002);
    mockApi({ 'GET /restaurants/:id': ok(detail()) });
    renderRoute('/restaurants/4/mapae-report');
    const checks = await screen.findByRole('region', { name: '자동 확인' });
    expect(await within(checks).findByText(/100m 안에서 제보해 주세요/)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('mapae-photo-input'), {
      target: {
        files: [new File(['jpeg'], 'old.jpg', { type: 'image/jpeg', lastModified: 0 })],
      },
    });
    expect(await within(checks).findByText(/오늘 찍은 사진이 아니에요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '기타' }));
    expect(screen.getByRole('button', { name: '제보하기' })).toBeDisabled();
  });

  it('새로 열면 지금 현황을 다시 받는다 (확정되면 +50P)', async () => {
    mockApi({
      'GET /mapae-reports/:id': ok(
        report({ status: 'CONFIRMED', reporterCount: 2, rewardPoint: 50 }),
      ),
    });
    renderRoute('/mapae-reports/12');
    expect(await screen.findByText('마패가 붙었어요')).toBeInTheDocument();
    expect(screen.getByText('서로 다른 방문자 제보 2건이 모였어요')).toBeInTheDocument();
    expect(screen.getByText('제보 보상 +50P를 받았어요')).toBeInTheDocument();
  });

  it('이미 제보했으면 서버 안내를 보여 준다', async () => {
    fakeHere(0);
    mockApi({
      'GET /restaurants/:id': ok(detail()),
      'POST /uploads/signed-url': ok({
        uploadUrl: 'https://storage.test/upload',
        method: 'PUT',
        headers: {},
        imageKey: 'mapae/1/a.jpg',
        expiresIn: 300,
      }),
      'PUT /upload': ok(null),
      'POST /restaurants/:id/mapae-reports': fail(
        409,
        'MAPAE_REPORT_DUPLICATE',
        '이미 이 가게를 제보했어요. 다른 방문자의 제보를 기다리는 중이에요.',
      ),
    });
    renderRoute('/restaurants/4/mapae-report');
    await screen.findByText('가게에서 0m');
    fireEvent.change(screen.getByTestId('mapae-photo-input'), {
      target: { files: [new File(['jpeg'], 'notice.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(await screen.findByRole('radio', { name: '리뷰 쓰면 서비스' }));
    fireEvent.click(screen.getByRole('button', { name: '제보하기' }));
    expect(await screen.findByText(/이미 이 가게를 제보했어요/)).toBeInTheDocument();
  });
});

describe('사장님 이의제기 (MAPAE-03) → 마패 문의 내역', () => {
  it('관계·사유·설명을 적어 보내면 접수 화면에 처리 상태와 보낸 내용이 보인다', async () => {
    const server = mockApi({
      'GET /restaurants/:id': ok(detail({ hasMapae: true, mapaeReportCount: 2 })),
      'POST /restaurants/:id/mapae-objections': ok({ inquiryId: 77, status: 'WAITING' }),
      'GET /inquiries/:id': ok({
        inquiryId: 77,
        category: 'MAPAE',
        content: '11월 10일에 이벤트를 끝냈어요',
        imageUrl: null,
        refVisit: null,
        mapaeObjection: {
          restaurant: { restaurantId: 4, name: '이벤트식당' },
          relation: 'OWNER',
          reason: 'ENDED',
        },
        status: 'WAITING',
        answer: null,
        answeredAt: null,
        regDate: '2026-11-17T15:00:00+09:00',
      }),
    });
    const { router } = renderRoute('/restaurants/4/mapae-objection');

    expect(await screen.findByRole('region', { name: '대상 가게 · 마패 정보' })).toHaveTextContent(
      '이벤트식당',
    );
    const submit = screen.getByRole('button', { name: '이의제기 접수하기' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('가게와의 관계'), { target: { value: 'OWNER' } });
    fireEvent.change(screen.getByLabelText('이의제기 사유'), { target: { value: 'ENDED' } });
    fireEvent.change(screen.getByLabelText('설명 및 변경 시점'), {
      target: { value: '11월 10일에 이벤트를 끝냈어요' },
    });
    fireEvent.click(submit);

    expect(await screen.findByText('이의제기가 접수됐어요')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?inquiryId=77&received=1');
    expect(server.calls('POST /restaurants/:id/mapae-objections')[0].body).toEqual({
      relation: 'OWNER',
      reason: 'ENDED',
      content: '11월 10일에 이벤트를 끝냈어요',
      imageKey: null,
    });
    const steps = screen.getByRole('list', { name: '처리 상태' });
    expect(within(steps).getByText('검토 중')).toHaveAttribute('aria-current', 'step');
    const sent = screen.getByRole('region', { name: '내가 보낸 내용' });
    expect(sent).toHaveTextContent('사장님 이의제기');
    expect(sent).toHaveTextContent('대표자');
    expect(sent).toHaveTextContent('이벤트를 종료했어요');
    expect(screen.getByRole('region', { name: '운영자 답변' })).toHaveTextContent(
      '아직 검토 중이에요.',
    );
    expect(screen.getByRole('link', { name: '가게로 돌아가기' })).toHaveAttribute(
      'href',
      '/restaurants/4',
    );
  });

  it('마패가 없는 가게면 이의제기할 수 없다고 알린다', async () => {
    mockApi({ 'GET /restaurants/:id': ok(detail()) });
    renderRoute('/restaurants/4/mapae-objection');
    expect(
      await screen.findByText('마패가 표시된 가게만 이의제기할 수 있어요'),
    ).toBeInTheDocument();
  });
});

describe('운영 관리: 사장님 이의제기', () => {
  it('이의제기 문의에 가게·관계·사유가 보이고, 가게 마패를 바로 해제한다', async () => {
    const server = mockApi({
      'GET /users/me': ok({ id: 1, nickname: '관리자', localRegions: [], isAdmin: true }),
      'GET /admin/inquiries': ok({
        items: [
          {
            inquiryId: 77,
            category: 'MAPAE',
            content: '11월 10일에 이벤트를 끝냈어요',
            imageUrl: null,
            refVisitId: null,
            mapaeObjection: {
              restaurant: { restaurantId: 4, name: '이벤트식당' },
              relation: 'MANAGER',
              reason: 'ENDED',
            },
            activeMapaeId: 9,
            user: { userId: 5, nickname: '사장님' },
            status: 'WAITING',
            answer: null,
            regDate: '2026-11-17T15:00:00+09:00',
            answeredAt: null,
          },
        ],
        page: 1,
        size: 20,
        totalCount: 1,
        hasNext: false,
      }),
      'PATCH /admin/mapae/:id/release': ok({
        mapaeId: 9,
        status: 'RELEASED',
        releasedAt: '2026-11-17T16:00:00+09:00',
      }),
    });
    renderRoute('/admin?tab=inquiries');
    const card = await screen.findByRole('article', { name: '문의 77' });
    expect(card).toHaveTextContent('사장님 이의제기');
    expect(card).toHaveTextContent('이벤트식당 · 매장 관리자 · 이벤트를 종료했어요');
    fireEvent.click(within(card).getByRole('button', { name: '가게 마패 해제하기' }));
    await waitFor(() =>
      expect(within(card).queryByRole('button', { name: '가게 마패 해제하기' })).toBeNull(),
    );
    expect(server.calls('PATCH /admin/mapae/:id/release')[0].body).toEqual({
      releaseReason: '사장님 이의제기 #77: 이벤트를 종료했어요',
    });
  });
});
