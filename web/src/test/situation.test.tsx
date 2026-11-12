import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FitReason, SituationItem, SituationResult } from '../api/situation';
import { resetViewRegionForTest } from '../lib/region';
import { setMyCoordsForTest } from '../lib/useMyCoords';
import { mockApi, ok } from './http';
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

const PARENTS = {
  who: 'FAMILY',
  when: 'WEEKEND_LUNCH',
  exclude: ['SPICY'],
  important: ['SPACIOUS', 'PARKING', 'QUIET', 'KIND'],
} as const;

const parsed = { found: true, conditions: PARENTS, title: '가족과 주말 점심', source: 'AI' };

const reason = (
  kind: FitReason['kind'],
  condition: string,
  label: string,
  status: FitReason['status'],
  evidence: string,
): FitReason => ({ kind, condition, label, status, evidence });

const reasons = [
  reason('WHO', 'FAMILY', '가족 · 부모님', 'MATCH', '가족 동행 리뷰 9건'),
  reason('WHEN', 'WEEKEND_LUNCH', '주말 점심', 'PARTIAL', '영업시간 정보 없음'),
  reason('EXCLUDE', 'SPICY', '매운 음식 빼기', 'MATCH', '맵다는 리뷰 없음'),
  reason('IMPORTANT', 'SPACIOUS', '좌석 넓음', 'MATCH', '넓다는 리뷰 12건'),
  reason('IMPORTANT', 'PARKING', '주차', 'NONE', '주차 어렵다는 리뷰 3건'),
];

const item: SituationItem = {
  restaurantId: 7,
  name: '가양 한상',
  categoryId: 1,
  categoryName: '한식',
  categoryDetail: '한식',
  imageUrl: null,
  distanceM: 450,
  rating: { score: 4.6, reviewCount: 30 },
  myOverallScore: 4.4,
  hasMapae: false,
  revisitRate: 40,
  localVisitRate: 60,
  conquestState: 'CONQUERED',
  fitScore: 92,
  why: '넓다는 리뷰 12건 · 가족 동행 리뷰 9건',
  tags: ['좌석 넉넉'],
  reasons,
};

const region = { regionId: 11, level: 3, dongName: '가양동', sigunguId: 2, sigunguName: '강서구' };

const result = (over: Partial<SituationResult> = {}): SituationResult => ({
  title: '가족과 주말 점심',
  conditions: { ...PARENTS, exclude: [...PARENTS.exclude], important: [...PARENTS.important] },
  region,
  items: [item],
  suggestions: [],
  ...over,
});

const base = {
  'GET /users/me': ok(me),
  'GET /regions/search': ok({ keyword: '', items: [GAYANG], totalCount: 1 }),
};

const input = () => screen.getByLabelText('지금 어떤 상황이에요?');

beforeEach(() => {
  resetViewRegionForTest();
  setMyCoordsForTest(null);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('상황 직접 입력 추천 /recommendations/situation', () => {
  it('추천맛집에서 "내 상황으로 추천"으로 들어간다', async () => {
    mockApi({ ...base, 'GET /recommendations': ok({ items: [], preferredCategories: [] }) });
    renderRoute('/recommendations');
    expect(await screen.findByRole('link', { name: /내 상황으로 추천/ })).toHaveAttribute(
      'href',
      '/recommendations/situation',
    );
  });

  it('문장 → 이해한 조건(✕로 빼기) → 상황 맞춤 결과 → 적합도 설명', async () => {
    const server = mockApi({
      ...base,
      'POST /recommendations/situation/parse': ok(parsed),
      'POST /recommendations/situation': ok(result()),
    });
    renderRoute('/recommendations/situation');

    const button = screen.getByRole('button', { name: '맞춤 추천 받기' });
    fireEvent.change(input(), { target: { value: '아' } });
    expect(button).toBeDisabled();
    fireEvent.change(input(), {
      target: { value: '부모님이랑 주말 점심, 아빠가 매운 거 못 드셔' },
    });
    expect(screen.getByText('26 / 60')).toBeInTheDocument();
    fireEvent.click(button);

    const card = await screen.findByRole('region', { name: '이렇게 이해했어요' });
    expect(within(card).getByText('AI 분석')).toBeInTheDocument();
    expect(server.calls('POST /recommendations/situation/parse')[0].body).toEqual({
      text: '부모님이랑 주말 점심, 아빠가 매운 거 못 드셔',
    });
    fireEvent.click(within(card).getByRole('button', { name: '주차 빼기' }));
    fireEvent.click(screen.getByRole('button', { name: '이 조건으로 추천 받기' }));

    expect(await screen.findByRole('heading', { name: '가족과 주말 점심' })).toBeInTheDocument();
    await waitFor(() =>
      expect(server.calls('POST /recommendations/situation')[0].body).toEqual({
        regionId: 11,
        conditions: { ...PARENTS, important: ['SPACIOUS', 'QUIET', 'KIND'] },
      }),
    );
    expect(screen.getByText('좌석·조용함·친절')).toBeInTheDocument();
    expect(screen.getByText('매운 음식 빼기')).toBeInTheDocument();
    expect(screen.getByText('정복 완료')).toBeInTheDocument();
    expect(screen.getByText('넓다는 리뷰 12건 · 가족 동행 리뷰 9건')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '가양 한상' })).toHaveAttribute(
      'href',
      '/restaurants/7',
    );

    fireEvent.click(screen.getByRole('button', { name: '상황 적합 92%' }));
    const sheet = screen.getByRole('dialog', { name: '상황 적합도 설명' });
    expect(within(sheet).getByText('가양 한상 · 상황 적합 92%')).toBeInTheDocument();
    expect(within(sheet).getByText('주차 어렵다는 리뷰 3건')).toBeInTheDocument();
    expect(within(sheet).getByRole('img', { name: '안 맞음' })).toBeInTheDocument();
    expect(within(sheet).getByText('신뢰 별점(★ 4.6 맛)은 바뀌지 않아요.')).toBeInTheDocument();
  });

  it('예시 칩을 누르면 그 문장으로 바로 조건을 읽는다', async () => {
    const server = mockApi({ ...base, 'POST /recommendations/situation/parse': ok(parsed) });
    renderRoute('/recommendations/situation');

    fireEvent.click(screen.getByRole('button', { name: '혼밥 빠르게' }));
    await screen.findByRole('region', { name: '이렇게 이해했어요' });
    expect(input()).toHaveValue('혼밥 빠르게');
    expect(server.calls('POST /recommendations/situation/parse')[0].body).toEqual({
      text: '혼밥 빠르게',
    });
  });

  it('조건을 못 찾으면 ⑤, "다시 입력하기"는 입력을 비운다', async () => {
    mockApi({
      ...base,
      'POST /recommendations/situation/parse': ok({
        found: false,
        conditions: { who: null, when: null, exclude: [], important: [] },
        title: null,
        source: 'RULE',
      }),
    });
    renderRoute('/recommendations/situation');

    fireEvent.change(input(), { target: { value: '아무거나 맛있는 거' } });
    fireEvent.click(screen.getByRole('button', { name: '맞춤 추천 받기' }));
    const card = await screen.findByRole('region', { name: '조건을 찾지 못했어요' });
    expect(within(card).getByRole('link', { name: '그냥 평소 추천 보기 ›' })).toHaveAttribute(
      'href',
      '/recommendations',
    );
    fireEvent.click(screen.getByRole('button', { name: '다시 입력하기' }));
    expect(input()).toHaveValue('');
    expect(screen.getByRole('button', { name: '부모님 모시고' })).toBeInTheDocument();
  });

  it('5초가 넘으면 "조금 더 걸리고 있어요"와 취소', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockApi({
      ...base,
      'POST /recommendations/situation/parse': () => new Promise(() => {}),
    });
    renderRoute('/recommendations/situation');

    fireEvent.change(input(), { target: { value: '부모님 모시고' } });
    fireEvent.click(screen.getByRole('button', { name: '맞춤 추천 받기' }));
    expect(await screen.findByRole('button', { name: '조건 읽는 중…' })).toBeDisabled();
    expect(screen.queryByText('조금 더 걸리고 있어요')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText('조금 더 걸리고 있어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByRole('button', { name: '맞춤 추천 받기' })).toBeEnabled();
  });

  it('③ 시트: 초기화는 AI 조건으로, 중요해요는 5개까지, 적용하면 바로 추천', async () => {
    const server = mockApi({
      ...base,
      'POST /recommendations/situation/parse': ok(parsed),
      'POST /recommendations/situation': ok(result()),
    });
    renderRoute('/recommendations/situation');
    fireEvent.click(screen.getByRole('button', { name: '부모님 모시고' }));
    await screen.findByRole('region', { name: '이렇게 이해했어요' });

    fireEvent.click(screen.getByRole('button', { name: '+ 조건 추가' }));
    const sheet = screen.getByRole('dialog', { name: '조건 추가 · 수정' });
    const pick = (name: string) => within(sheet).getByRole('button', { name: new RegExp(name) });
    expect(within(sheet).getByRole('button', { name: '적용하기 (조건 7개)' })).toBeEnabled();
    fireEvent.click(pick('빨리 나옴'));
    expect(pick('가성비')).toBeDisabled();
    fireEvent.click(pick('가족 · 부모님'));
    fireEvent.click(pick('날것 · 회'));
    expect(within(sheet).getByRole('button', { name: '적용하기 (조건 8개)' })).toBeEnabled();
    fireEvent.click(within(sheet).getByRole('button', { name: '초기화' }));
    fireEvent.click(pick('친구'));
    fireEvent.click(within(sheet).getByRole('button', { name: '적용하기 (조건 7개)' }));

    await waitFor(() =>
      expect(server.calls('POST /recommendations/situation')[0].body).toEqual({
        regionId: 11,
        conditions: { ...PARENTS, who: 'FRIEND' },
      }),
    );
  });

  it('⑥ 딱 맞는 곳이 없으면 제안: 조건 빼기·동네 넓히기로 다시 찾는다', async () => {
    const server = mockApi({
      ...base,
      'POST /recommendations/situation/parse': ok(parsed),
      'POST /recommendations/situation': ok(
        result({
          items: [],
          suggestions: [
            {
              type: 'REMOVE',
              kind: 'IMPORTANT',
              condition: 'PARKING',
              regionId: null,
              label: '주차 빼기',
              count: 4,
            },
            {
              type: 'WIDEN',
              kind: null,
              condition: null,
              regionId: 2,
              label: '동네 넓히기 · 강서구 전체',
              count: 6,
            },
          ],
        }),
      ),
    });
    renderRoute('/recommendations/situation');
    fireEvent.click(screen.getByRole('button', { name: '부모님 모시고' }));
    fireEvent.click(await screen.findByRole('button', { name: '이 조건으로 추천 받기' }));

    const card = await screen.findByRole('region', { name: '조건에 딱 맞는 가게가 없어요' });
    expect(
      within(card).getByText(/조건 7개를 모두 맞추는 가게가 강서구 · 가양동에 아직 없어요/),
    ).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: /주차 빼기/ }));
    await waitFor(() => expect(server.calls('POST /recommendations/situation')).toHaveLength(2));
    expect(server.calls('POST /recommendations/situation')[1].body).toEqual({
      regionId: 11,
      conditions: { ...PARENTS, important: ['SPACIOUS', 'QUIET', 'KIND'] },
    });

    fireEvent.click(await screen.findByRole('button', { name: /동네 넓히기 · 강서구 전체/ }));
    await waitFor(() => expect(server.calls('POST /recommendations/situation')).toHaveLength(3));
    expect(server.calls('POST /recommendations/situation')[2].body).toMatchObject({
      regionId: 2,
    });
  });
});

describe('⑦ 상황 맞춤에서 연 음식점 상세', () => {
  it('"…에 맞는 이유"는 맞음 2줄(중요해요 먼저) + 부분 1줄, 적합도를 누르면 설명 시트', async () => {
    mockApi({
      ...base,
      'GET /restaurants/:id': ok({
        restaurantId: 7,
        kakaoPlaceId: null,
        name: '가양 한상',
        status: 'A',
        categoryId: 1,
        categoryName: '한식',
        imageUrl: null,
        categoryDetail: '한식',
        phone: null,
        roadAddress: null,
        jibunAddress: null,
        sigunguName: '강서구',
        dongName: '가양동',
        lat: 37.56,
        lng: 126.85,
        distanceM: null,
        kakaoPlaceUrl: null,
        businessHours: null,
        businessStatus: null,
        rating: { score: 4.6, reviewCount: 30 },
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
      }),
      'GET /restaurants/:id/reviews': ok({ items: [], page: 1, size: 2, totalCount: 0 }),
    });
    renderRoute('/restaurants/7', {
      state: { situation: { title: '가족과 주말 점심', fitScore: 92, reasons } },
    });

    const card = await screen.findByRole('region', { name: '상황에 맞는 이유' });
    expect(within(card).getByText('가족과 주말 점심에 맞는 이유')).toBeInTheDocument();
    expect(
      within(card)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['✓넓다는 리뷰 12건', '✓가족 동행 리뷰 9건', '△영업시간 정보 없음']);
    fireEvent.click(within(card).getByRole('button', { name: '상황 적합 92% ›' }));
    expect(screen.getByRole('dialog', { name: '상황 적합도 설명' })).toBeInTheDocument();
  });

  it('그냥 열면 이유 카드가 없다', async () => {
    mockApi({ ...base, 'GET /restaurants/:id': () => new Promise(() => {}) });
    renderRoute('/restaurants/7');
    await act(() => Promise.resolve());
    expect(screen.queryByRole('region', { name: '상황에 맞는 이유' })).not.toBeInTheDocument();
  });
});
