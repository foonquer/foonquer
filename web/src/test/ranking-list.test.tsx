import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { resetViewRegionForTest } from '../lib/region';
import { mockApi, ok } from './http';
import { renderRoute } from './render';

const season = {
  seasonId: 3,
  seasonNo: 3,
  name: '시즌 3',
  startDate: '2026-09-01',
  endDate: '2027-02-28',
  status: 'ACTIVE',
  daysLeft: 115,
};
const page = <T,>(items: T[]) => ({
  items,
  page: 1,
  size: 20,
  totalCount: items.length,
  hasNext: false,
});
const tier = (tierName: string, next: string | null, remaining = 0) => ({
  tier: 'REGULAR',
  tierName,
  tierTitle: `강서구 ${tierName}`,
  nextTier: next ? { tier: 'GOURMET', tierName: next, remaining } : null,
});

describe('구 랭킹 TOP 50', () => {
  it('TOP 3의 PICK과 전체 순위를 먹깨비·티어와 보여 주고, 줄을 누르면 프로필로 간다', async () => {
    const row = (rank: number, nickname: string, hatCode: string | null, isMe = false) => ({
      rank,
      userId: rank + 10,
      nickname,
      conquestCount: 40 - rank,
      tier: 'GOURMET',
      tierName: rank === 1 ? '먹짱' : '미식가',
      isMe,
      profileImageUrl: null,
      mukkaebi: { level: 7, hatCode },
    });
    mockApi({
      'GET /seasons': ok({ items: [season] }),
      'GET /rankings/sigungus/:id': ok({
        season,
        sigunguId: 1,
        sigunguName: '강서구',
        activeExplorerCount: 4,
        items: [
          row(1, '마라탕러버', 'HAT_CROWN'),
          row(2, '돈까스왕', null),
          row(3, '디저트헌터', 'HAT_CHICK'),
          row(4, '1234', null, true),
        ],
        myRank: { rank: 4, conquestCount: 36, topPercent: 50, tier: 'GOURMET', mukjjangGap: 3 },
        topPicks: [
          {
            rank: 1,
            userId: 11,
            nickname: '마라탕러버',
            pickCount: 3,
            restaurants: [
              { restaurantId: 1, name: '통나무집닭갈비' },
              { restaurantId: 2, name: '루씨엘브런치' },
            ],
          },
          { rank: 2, userId: 12, nickname: '돈까스왕', pickCount: 0, restaurants: [] },
        ],
      }),
    });
    renderRoute('/ranking/sigungus/1');

    const picks = await screen.findByRole('region', { name: '강서구 TOP 3의 PICK' });
    const pick = within(picks).getByRole('link', { name: /마라탕러버의 PICK/ });
    expect(pick).toHaveAttribute('href', '/users/11?tab=pick');
    expect(within(pick).getByText('통나무집닭갈비 · 루씨엘브런치 외 1곳')).toBeInTheDocument();
    // PICK이 없는 사람은 줄을 만들지 않는다
    expect(within(picks).queryByText(/돈까스왕/)).not.toBeInTheDocument();

    const list = screen.getByRole('list', { name: '전체 순위' });
    const mine = within(list).getByRole('link', { name: /1234/ });
    expect(mine).toHaveAttribute('href', '/users/14');
    expect(within(mine).getByText('나')).toBeInTheDocument();
    expect(within(mine).getByText('미식가')).toBeInTheDocument();
    expect(within(mine).getByText('36곳')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: /마라탕러버/ })).toHaveAttribute(
      'href',
      '/users/11',
    );
  });
});

describe('랭킹/현황', () => {
  it('현황: 구별 정복과 다음 티어까지 남은 수, 랭킹: 구를 고르면 먹짱과 TOP 50 링크', async () => {
    mockApi({
      'GET /users/me/conquests/sigungus': ok({
        season,
        totalConquestCount: 16,
        sigunguCount: 2,
        items: [
          {
            sigunguId: 1,
            sigunguName: '강서구',
            isLocal: true,
            conquestCount: 8,
            rank: 8,
            topPercent: 7,
            activeExplorerCount: 120,
            ...tier('단골', '미식가', 12),
          },
          {
            sigunguId: 5,
            sigunguName: '마포구',
            isLocal: false,
            conquestCount: 5,
            rank: 14,
            topPercent: 20,
            activeExplorerCount: 90,
            ...tier('단골', '미식가', 15),
          },
        ],
      }),
      'GET /rankings/mukjjang-map': ok({
        season,
        level: 'SIGUNGU',
        items: [
          {
            sigunguId: 1,
            name: '강서구',
            centerLat: 37.55,
            centerLng: 126.85,
            mukjjang: {
              userId: 9,
              nickname: '동네미식가',
              profileImageUrl: null,
              level: 7,
              conquestCount: 18,
              isMe: false,
            },
            myRank: 8,
            myConquestCount: 8,
            mukjjangGap: 11,
          },
          {
            sigunguId: 5,
            name: '마포구',
            centerLat: 37.56,
            centerLng: 126.9,
            mukjjang: null,
            myRank: null,
            myConquestCount: 0,
            mukjjangGap: 1,
          },
        ],
      }),
    });
    const { router } = renderRoute('/ranking');

    expect(await screen.findByText('총 16곳 정복')).toBeInTheDocument();
    expect(screen.getByText('2개 구 탐험 중')).toBeInTheDocument();
    const gangseo = screen.getAllByRole('link', { name: /강서구/ })[1];
    expect(gangseo).toHaveTextContent('미식가까지 12곳');
    expect(gangseo).toHaveAttribute('href', '/ranking/sigungus/1/status');

    fireEvent.click(screen.getByRole('tab', { name: '랭킹' }));
    expect(router.state.location.search).toBe('?tab=rank');
    const card = await screen.findByRole('region', { name: '강서구의 먹짱' });
    expect(card).toHaveTextContent('동네미식가');
    expect(card).toHaveTextContent('내 순위 8위 · 먹짱까지 11곳');
    // 서울 25개 구 경계를 그리고, 고른 구는 맨 위에 테두리를 굵게
    const board = screen.getByRole('group', { name: /구별 먹짱 지도/ });
    const outlines = board.querySelectorAll('path[data-selected]');
    expect(outlines).toHaveLength(25);
    expect(board.querySelectorAll('path[data-selected="true"]')).toHaveLength(1);
    expect(outlines[24]).toHaveAttribute('data-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: '마포구' }));
    expect(screen.getByRole('region', { name: '마포구의 먹짱' })).toHaveTextContent(
      '아직 먹짱이 없어요',
    );
    expect(screen.getByRole('link', { name: '마포구 TOP 50 보기 ›' })).toHaveAttribute(
      'href',
      '/ranking/sigungus/5',
    );
  });

  it('순위 변동 알림(/ranking?sigunguId=)으로 오면 랭킹 탭에서 그 구를 고른다', async () => {
    mockApi({
      'GET /rankings/mukjjang-map': ok({
        season,
        level: 'SIGUNGU',
        items: [1, 5].map((sigunguId) => ({
          sigunguId,
          name: sigunguId === 1 ? '강서구' : '마포구',
          centerLat: 37.55,
          centerLng: 126.9,
          mukjjang: null,
          myRank: sigunguId === 1 ? 8 : null,
          myConquestCount: 0,
          mukjjangGap: 1,
        })),
      }),
    });
    renderRoute('/ranking?sigunguId=5');
    expect(await screen.findByRole('region', { name: '마포구의 먹짱' })).toBeInTheDocument();
  });

  it('순위가 있는 구가 없으면 내 동네 구를 먼저 보여 준다 (목록 첫 구가 아니라)', async () => {
    mockApi({
      'GET /users/me': ok({
        id: 1,
        nickname: '아기깨비',
        localRegions: [{ regionId: 11, dongName: '가양동', sigunguId: 5, sigunguName: '강서구' }],
      }),
      'GET /rankings/mukjjang-map': ok({
        season,
        level: 'SIGUNGU',
        items: [1, 5].map((sigunguId) => ({
          sigunguId,
          name: sigunguId === 1 ? '종로구' : '강서구',
          centerLat: 37.55,
          centerLng: 126.9,
          mukjjang: null,
          myRank: null,
          myConquestCount: 0,
          mukjjangGap: 1,
        })),
      }),
    });
    renderRoute('/ranking?tab=rank');
    expect(await screen.findByRole('region', { name: '강서구의 먹짱' })).toBeInTheDocument();
  });

  it('진행 중 시즌이 없으면 안내한다', async () => {
    mockApi({
      'GET /users/me/conquests/sigungus': {
        status: 404,
        body: { success: false, code: 'NO_ACTIVE_SEASON', message: '시즌 없음' },
      },
    });
    renderRoute('/ranking');
    expect(await screen.findByText('진행 중인 시즌이 없어요')).toBeInTheDocument();
  });
});

describe('맛집 리스트', () => {
  it('저장한 가게를 지도와 탭으로 보여 주고, 핀을 누르면 정보창을 띄운다', async () => {
    const server = mockApi({
      'GET /users/me/saved-restaurants': ok({
        summary: { totalCount: 2, wantCount: 1, conqueredCount: 1 },
        pins: [
          { restaurantId: 1, name: '새맛집', lat: 37.56, lng: 126.85, conquered: false },
          { restaurantId: 2, name: '대전식탁', lat: 36.33, lng: 127.42, conquered: true },
        ],
        ...page([
          {
            restaurantId: 1,
            name: '새맛집',
            categoryName: '한식',
            regionLabel: '서울 강서구',
            dongName: '가양동',
            lat: 37.56,
            lng: 126.85,
            isClosed: false,
            memo: '수제비도 맛있대요',
            remind: true,
            savedAt: '',
            savedDaysAgo: 12,
            conqueredAt: null,
          },
        ]),
      }),
    });
    const { router } = renderRoute('/list');

    expect(await screen.findByText('모아둔 2곳 · 아직 안 가본 맛집 1곳')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /새맛집.*수제비도 맛있대요.*12일 전 저장/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /☆새맛집|새맛집/ }));
    const info = screen.getByRole('region', { name: '새맛집 정보' });
    expect(info).toHaveTextContent('12일 전에 저장했어요. 이번에 들러볼까요?');

    fireEvent.click(screen.getByRole('tab', { name: '정복한 곳 1' }));
    expect(router.state.location.search).toBe('?tab=CONQUERED');
    await waitFor(() =>
      expect(server.calls('GET /users/me/saved-restaurants').at(-1)?.query.get('tab')).toBe(
        'CONQUERED',
      ),
    );
  });

  it('검색해서 메모·알림과 함께 가고 싶은 곳에 저장한다', async () => {
    resetViewRegionForTest({
      regionId: 11,
      dongName: '가양동',
      sigunguName: '강서구',
      lat: 37.56,
      lng: 126.85,
    });
    const server = mockApi({
      'GET /restaurants/search': ok({
        ...page([
          {
            restaurantId: 3,
            name: '망원손칼국수',
            categoryName: '칼국수',
            distanceM: null,
            rating: { score: 4.1, reviewCount: 3 },
            myOverallScore: 4.0,
            hasMapae: false,
            revisitRate: null,
            localVisitRate: null,
            conquestState: 'NOT_CONQUERED',
            matchedBy: 'NAME',
            matchedMenuName: null,
          },
        ]),
        emptyGuide: null,
      }),
      'PUT /users/me/saved-restaurants/:id': ok({}),
    });
    renderRoute('/list/add');

    fireEvent.change(screen.getByRole('searchbox', { name: '가게 이름 검색' }), {
      target: { value: '칼국수' },
    });
    fireEvent.submit(screen.getByRole('search'));
    fireEvent.click(await screen.findByRole('button', { name: '망원손칼국수 저장' }));
    const sheet = screen.getByRole('dialog', { name: '가고 싶은 곳에 저장' });
    fireEvent.change(within(sheet).getByLabelText('메모 (선택)'), {
      target: { value: '주말엔 웨이팅' },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: '☆ 가고 싶은 곳에 저장' }));

    expect(await screen.findByRole('button', { name: '망원손칼국수 저장 취소' })).toHaveTextContent(
      '★ 저장됨',
    );
    expect(server.calls('GET /restaurants/search')[0].query.get('scope')).toBe('SIGUNGU');
    expect(server.calls('PUT /users/me/saved-restaurants/:id')[0]).toMatchObject({
      path: '/users/me/saved-restaurants/3',
      body: { memo: '주말엔 웨이팅', remind: true },
    });
  });

  it('이미 저장한 가게는 저장됨으로 보이고, 저장 취소는 한 번만 보낸다', async () => {
    resetViewRegionForTest({
      regionId: 11,
      dongName: '가양동',
      sigunguName: '강서구',
      lat: 37.56,
      lng: 126.85,
    });
    let finish = () => {};
    const server = mockApi({
      'GET /users/me/saved-restaurants': ok({
        summary: { totalCount: 1, wantCount: 1, conqueredCount: 0 },
        pins: [{ restaurantId: 3, name: '망원손칼국수', lat: 37.5, lng: 126.9, conquered: false }],
        ...page([]),
      }),
      'GET /restaurants/search': ok({
        ...page([
          {
            restaurantId: 3,
            name: '망원손칼국수',
            categoryName: '칼국수',
            distanceM: null,
            rating: { score: null, reviewCount: 0 },
            myOverallScore: null,
            hasMapae: false,
            revisitRate: null,
            localVisitRate: null,
            conquestState: 'NOT_CONQUERED',
            matchedBy: 'NAME',
            matchedMenuName: null,
          },
        ]),
        emptyGuide: null,
      }),
      'DELETE /users/me/saved-restaurants/:id': () =>
        new Promise<ReturnType<typeof ok>>((resolve) => (finish = () => resolve(ok({})))),
    });
    renderRoute('/list/add');

    fireEvent.change(screen.getByRole('searchbox', { name: '가게 이름 검색' }), {
      target: { value: '칼국수' },
    });
    fireEvent.submit(screen.getByRole('search'));
    const unsave = await screen.findByRole('button', { name: '망원손칼국수 저장 취소' });
    expect(unsave).toHaveTextContent('★ 저장됨');
    fireEvent.click(unsave);
    fireEvent.click(unsave);
    finish();
    expect(await screen.findByRole('button', { name: '망원손칼국수 저장' })).toHaveTextContent(
      '☆ 저장',
    );
    expect(server.calls('DELETE /users/me/saved-restaurants/:id')).toHaveLength(1);
  });
});

describe('내 기록', () => {
  it('내 PICK: 정복한 가게를 고르고 순서·코멘트를 바꿔 저장한다', async () => {
    const candidate = (restaurantId: number, name: string, isPicked = false) => ({
      restaurantId,
      name,
      categoryName: '한식',
      dongName: '가양동',
      visitCount: 2,
      isPicked,
    });
    const server = mockApi({
      'GET /users/me/picks': ok({
        picks: [
          {
            order: 1,
            restaurantId: 1,
            name: '옛날손칼국수',
            categoryName: '칼국수',
            sigunguName: '강서구',
            dongName: '가양동',
            lat: 0,
            lng: 0,
            comment: '겉절이가 진짜예요',
            visitCount: 6,
          },
        ],
        maxPicks: 10,
        candidates: page([candidate(1, '옛날손칼국수', true), candidate(2, '수정식당')]),
      }),
      'PUT /users/me/picks': ok({ picks: [] }),
    });
    renderRoute('/me/pick');

    fireEvent.click(await screen.findByRole('checkbox', { name: /수정식당/ }));
    expect(screen.getByText('선택 2 / 10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '수정식당 위로' }));
    fireEvent.change(screen.getByRole('textbox', { name: '수정식당 한 줄 코멘트' }), {
      target: { value: '백반 최고' },
    });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(server.calls('PUT /users/me/picks')).toHaveLength(1));
    expect(server.calls('PUT /users/me/picks')[0].body).toEqual({
      picks: [
        { restaurantId: 2, comment: '백반 최고' },
        { restaurantId: 1, comment: '겉절이가 진짜예요' },
      ],
    });
  });

  it('시즌 기록·칭호: 칭호를 누르면 대표 칭호로 바꾼다', async () => {
    const server = mockApi({
      'GET /users/me/season-records': ok({ current: null, records: [] }),
      'GET /users/me/titles': ok({
        representativeTitle: '강서구 단골',
        isAuto: true,
        totalCount: 1,
        items: [
          {
            type: 'ACHIEVEMENT',
            refId: 4,
            title: '첫 정복',
            seasonNo: null,
            isCurrent: false,
            isRepresentative: false,
          },
        ],
      }),
      'GET /users/me/achievements': ok({
        achievedCount: 1,
        totalCount: 1,
        representativeTitle: null,
        items: [],
      }),
      'PATCH /users/me/representative-title': ok({
        representativeTitle: '첫 정복',
        isAuto: false,
      }),
    });
    renderRoute('/me/seasons');
    // 먹짱이었던 적이 없으면 카드 만들기는 잠김
    expect(
      await within(await screen.findByRole('region', { name: '먹짱 카드 만들기' })).findByText(
        '잠김',
      ),
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /첫 정복/ }));
    expect(await screen.findByText('대표 칭호를 첫 정복으로 바꿨어요')).toBeInTheDocument();
    expect(server.calls('PATCH /users/me/representative-title')[0].body).toEqual({
      type: 'ACHIEVEMENT',
      refId: 4,
    });
  });

  it('먹짱 카드: 시즌·구·PICK TOP 3를 담고 테마를 바꾸며 내 PICK 링크를 복사한다', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mockApi({
      'GET /users/me': ok({ id: 1, nickname: '동네미식가', localRegions: [] }),
      'GET /users/me/season-records': ok({
        current: {
          season,
          conquestCount: 18,
          sigunguCount: 1,
          best: {
            sigunguId: 2,
            sigunguName: '강서구',
            rank: 1,
            tier: 'MUKJJANG',
            tierName: '먹짱',
            tierTitle: '강서구의 먹짱',
            nextTier: null,
          },
        },
        records: [],
      }),
      'GET /users/:id/profile': ok({
        userId: 1,
        nickname: '동네미식가',
        trustTemp: 51,
        picks: ['옛날손칼국수', '수정식당', '이가네떡볶이', '마포숯불갈비'].map((name, i) => ({
          order: i + 1,
          restaurantId: i + 1,
          name,
          categoryName: '한식',
          sigunguName: '강서구',
          dongName: '가양동',
          lat: 0,
          lng: 0,
          comment: null,
          visitCount: 1,
        })),
      }),
    });
    renderRoute('/me/mukjjang-card');

    const card = await screen.findByRole('img', { name: /시즌 3 강서구 먹짱 동네미식가 카드/ });
    const svg = decodeURIComponent((card as HTMLImageElement).src.split(',')[1]);
    expect(svg).toContain('SEASON 3 · HALL OF FAME');
    expect(svg).toContain('정복 18곳 · 강서구 1위 · 신뢰 온도 51.0°');
    expect(svg).toContain('이가네떡볶이');
    expect(svg).not.toContain('마포숯불갈비'); // TOP 3까지만
    expect(svg).toContain('#272b5e'); // 기본 테마 밤하늘

    fireEvent.click(screen.getByRole('radio', { name: '크림' }));
    expect(screen.getByRole('radio', { name: '크림' })).toHaveAttribute('aria-checked', 'true');
    expect(decodeURIComponent((card as HTMLImageElement).src)).toContain('#fdf1d6');
    // 라디오 묶음: 고른 테마만 탭 순서에 있고, 화살표로 옮긴다
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('tabindex'))).toEqual([
      '-1',
      '0',
      '-1',
    ]);
    fireEvent.keyDown(screen.getByRole('radio', { name: '크림' }), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: '크림' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getAllByRole('radio')[2]).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('button', { name: '링크 복사' }));
    expect(await screen.findByText('내 PICK 링크를 복사했어요')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/users/1?tab=pick`);
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('먹짱 카드: 먹짱이었던 적이 없으면 만들 수 없다고 알려 준다', async () => {
    mockApi({
      'GET /users/me': ok({ id: 1, nickname: '동네미식가', localRegions: [] }),
      'GET /users/me/season-records': ok({ current: null, records: [] }),
    });
    renderRoute('/me/mukjjang-card');
    expect(await screen.findByText('구 먹짱이 되면 만들 수 있어요')).toBeInTheDocument();
  });

  it('정복 기록: 달별로 묶고 맛 별점을 보여 준다', async () => {
    mockApi({
      'GET /users/me': ok({ id: 1, nickname: '아기깨비', localRegions: [] }),
      'GET /users/me/conquests/sigungus': ok({
        season,
        totalConquestCount: 2,
        sigunguCount: 2,
        items: [],
      }),
      'GET /users/:id/visited-restaurants': ok({
        seasonId: 3,
        isMe: true,
        ...page([
          {
            restaurantId: 7,
            name: '새맛집',
            categoryName: '한식',
            sigunguName: '강서구',
            dongName: '가양동',
            overallScore: 4.4,
            reviewId: 50,
            conqueredAt: '2026-09-25T12:00:00+09:00',
          },
          {
            restaurantId: 8,
            name: '뚝섬포차',
            categoryName: '기타',
            sigunguName: '성동구',
            dongName: '성수동',
            overallScore: null,
            reviewId: null,
            conqueredAt: '2026-08-28T12:00:00+09:00',
          },
        ]),
      }),
    });
    renderRoute('/me/conquests');
    const september = await screen.findByRole('region', { name: '9월' });
    expect(
      within(september).getByRole('link', { name: /25.*금.*새맛집.*맛 ★ 4.4/ }),
    ).toHaveAttribute('href', '/reviews/50');
    expect(within(screen.getByRole('region', { name: '8월' })).getByRole('link')).toHaveAttribute(
      'href',
      '/restaurants/8',
    );
    expect(screen.getByText('2곳 · 2개 구')).toBeInTheDocument();
  });
});
