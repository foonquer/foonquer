import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Quest, QuestWeek } from '../api/quests';
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

const week = (over: Partial<QuestWeek> = {}): QuestWeek => ({
  weekId: 5,
  startDate: '2026-11-09',
  endDate: '2026-11-15',
  isCurrent: true,
  daysLeft: 4,
  activity: 'MEDIUM',
  activityName: '활동 보통',
  baseCount: 3,
  doneCount: 1,
  bonusDoneCount: 0,
  swapAvailable: true,
  boxReceived: false,
  ...over,
});

const quest = (over: Partial<Quest> = {}): Quest => ({
  questId: 21,
  type: 'NEW_TASTE',
  typeName: '새 맛 탐험',
  level: 'EXPLORE',
  levelName: '탐험',
  title: '단골 국밥집 말고 새 국밥집',
  summary: '최근 한 달 방문의 70%가 같은 국밥집이에요',
  reasons: [
    '최근 한 달 방문 10번 중 7번이 같은 국밥집이었어요',
    '중요하게 보는 청결이 4.6점이에요',
  ],
  target: 1,
  progress: 0,
  rewardPoint: 100,
  isBonus: false,
  status: 'ACTIVE',
  completedAt: null,
  restaurant: {
    restaurantId: 7,
    name: '옛날순대국',
    categoryName: '한식',
    imageUrl: null,
    regionName: '등촌동',
    distanceM: 650,
    tasteScore: 4.5,
    myOverallScore: 4.4,
    isConquered: false,
  },
  region: null,
  ...over,
});

const current = (over: { quests?: Quest[]; week?: QuestWeek } = {}) => ({
  enabled: true,
  week: over.week ?? week(),
  quests: over.quests ?? [
    quest({
      questId: 20,
      type: 'SAVED_VISIT',
      typeName: '저장한 곳 가기',
      level: 'EASY',
      levelName: '쉬움',
      title: '이가네떡볶이 정복',
      status: 'DONE',
      rewardPoint: 50,
    }),
    quest(),
    quest({
      questId: 22,
      type: 'NEXT_DONG',
      typeName: '옆 동네 한 바퀴',
      level: 'CHALLENGE',
      levelName: '도전',
      title: '등촌동에서 새로운 곳 2곳',
      summary: '등촌동에 정복할 곳이 12곳 있어요',
      target: 2,
      rewardPoint: 150,
      restaurant: null,
      region: { regionId: 12, name: '등촌동' },
    }),
  ],
  streak: 2,
});

/** 홈 화면을 그리는 데 필요한 API */
const homeApi = {
  'GET /users/me': ok(me),
  'GET /regions/search': ok({ keyword: '', items: [GAYANG], totalCount: 1 }),
  'GET /map/restaurants': ok({ items: [], totalCount: 0, truncated: false }),
};

beforeEach(() => {
  resetViewRegionForTest();
  setMyCoordsForTest(null);
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('홈 퀘스트 아이콘 · 이번 주 퀘스트 시트 (Q1·Q2)', () => {
  it('진행(1/3)과 새 퀘스트 점을 보여 주고, 누르면 시트에 퀘스트와 주간 상자 진행이 나온다', async () => {
    mockApi({ ...homeApi, 'GET /quests/current': ok(current()) });
    renderRoute('/');

    const button = await screen.findByRole('button', { name: '이번 주 퀘스트 1/3' });
    expect(button.querySelector('[class*="questDot"]')).not.toBeNull();
    expect(button.querySelector('[class*="questBar"]')).not.toBeNull();
    fireEvent.click(button);

    const sheet = await screen.findByRole('dialog', { name: '이번 주 퀘스트' });
    expect(within(sheet).getByText('D-4 · 월요일마다 새로 받아요')).toBeInTheDocument();
    expect(within(sheet).getByText('활동 보통 · 3개')).toBeInTheDocument();
    const card = within(sheet).getByRole('link', { name: /단골 국밥집 말고 새 국밥집/ });
    expect(card).toHaveAttribute('href', '/quests/21');
    expect(within(card).getByText('옛날순대국 · 내 종합 4.4 · 등촌동 650m')).toBeInTheDocument();
    expect(within(sheet).getByText('완료')).toBeInTheDocument();
    expect(within(sheet).getByRole('progressbar', { name: '진행' })).toHaveAttribute(
      'aria-valuemax',
      '2',
    );
    expect(within(sheet).getByText('3개 모두 깨면 주간 아이템 상자')).toBeInTheDocument();
    expect(
      within(sheet).getByText('1/3 완료 · 다 깨면 보너스 퀘스트가 열려요'),
    ).toBeInTheDocument();

    // 한 번 열어 본 퀘스트는 점이 사라진다
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(button.querySelector('[class*="questDot"]')).toBeNull());
  });

  it('아직 하나도 못 깼으면 진행 링을 그리지 않는다', async () => {
    mockApi({
      ...homeApi,
      'GET /quests/current': ok(current({ week: week({ doneCount: 0 }), quests: [quest()] })),
    });
    renderRoute('/');
    const button = await screen.findByRole('button', { name: '이번 주 퀘스트 0/3' });
    expect(button.querySelector('[class*="questTrack"]')).not.toBeNull();
    expect(button.querySelector('[class*="questBar"]')).toBeNull();
  });

  it('맞춤 퀘스트를 껐으면 아이콘이 없다', async () => {
    mockApi({
      ...homeApi,
      'GET /quests/current': ok({ enabled: false, week: null, quests: [], streak: 0 }),
    });
    renderRoute('/');
    await screen.findByRole('region', { name: '동네 지도' });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('button', { name: /이번 주 퀘스트/ })).not.toBeInTheDocument();
  });
});

describe('퀘스트 상세 (Q3)', () => {
  const detail = (over: Partial<Quest> & { swapAvailable?: boolean } = {}) =>
    ok({
      ...quest(over),
      week: week({ swapAvailable: over.swapAvailable ?? true }),
      boxRemaining: 2,
      canChange: true,
    });

  it('이유와 보상을 보여 주고, 정복하러 가기는 그 가게 방문 인증으로', async () => {
    mockApi({ 'GET /quests/:id': detail() });
    renderRoute('/quests/21');
    expect(await screen.findByText('단골 국밥집 말고 새 국밥집 정복하기')).toBeInTheDocument();
    expect(screen.getByText('탐험')).toBeInTheDocument();
    expect(screen.getByText('새 맛 탐험 · D-4 · +100P')).toBeInTheDocument();
    const why = screen.getByRole('region', { name: '왜 나에게 왔나요?' });
    expect(
      within(why).getByText('최근 한 달 방문 10번 중 7번이 같은 국밥집이었어요'),
    ).toBeInTheDocument();
    expect(screen.getByText('완료하면 +100P · 주간 상자까지 2개 남아요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '정복하러 가기' })).toHaveAttribute(
      'href',
      '/visits/new?restaurantId=7',
    );
  });

  it('다른 퀘스트로 바꾸면 새 퀘스트로 가고, 이번 주에 이미 바꿨으면 막는다', async () => {
    const server = mockApi({
      'GET /quests/:id': ({ path }) =>
        path.endsWith('/30')
          ? detail({ questId: 30, title: '청결이 좋은 한식집 정복', swapAvailable: false })
          : detail(),
      'POST /quests/:id/swap': ok(quest({ questId: 30 }), '다른 퀘스트로 바꿨어요.'),
    });
    const { router } = renderRoute('/quests/21');
    fireEvent.click(await screen.findByRole('button', { name: /다른 퀘스트로 바꾸기/ }));
    expect(await screen.findByText('청결이 좋은 한식집 정복하기')).toBeInTheDocument();
    expect(server.calls('POST /quests/:id/swap')[0].path).toBe('/quests/21/swap');
    expect(router.state.location.pathname).toBe('/quests/30');
    expect(screen.getByRole('button', { name: '이번 주는 이미 바꿨어요' })).toBeDisabled();
  });

  it('관심 없어요가 실패하면 이유를 알려 준다', async () => {
    mockApi({
      'GET /quests/:id': detail(),
      'POST /quests/:id/dismiss': fail(
        409,
        'QUEST_NO_REPLACEMENT',
        '지금은 바꿔 줄 다른 퀘스트가 없어요.',
      ),
    });
    renderRoute('/quests/21');
    fireEvent.click(await screen.findByRole('button', { name: '관심 없어요' }));
    expect(await screen.findByText('지금은 바꿔 줄 다른 퀘스트가 없어요.')).toBeInTheDocument();
  });
});

describe('퀘스트 완료 · 주간 상자 (Q4·Q5)', () => {
  const rating = (questResult: object | null) => ({
    reviewId: 50,
    visitId: 31,
    overallScore: 4.5,
    restaurant: { restaurantId: 7, name: '옛날순대국' },
    conquest: {
      isNewConquest: true,
      isFirstEver: true,
      sigunguId: 2,
      sigunguName: '강서구',
      conquestCount: 8,
      rank: 7,
      previousRank: 8,
      topPercent: 11,
      tier: 'REGULAR',
      tierTitle: '강서구 단골',
      nextTier: null,
    },
    rewards: { point: 100, levelUp: null },
    celebrations: { tierUp: null, backgroundUnlocked: null, achievements: [] },
    nextReward: null,
    quest: questResult,
  });
  const completed = {
    questId: 21,
    typeName: '새 맛 탐험',
    levelName: '탐험',
    title: '단골 국밥집 말고 새 국밥집',
    rewardPoint: 100,
    isBonus: false,
  };

  it('퀘스트를 깨면 보상과 이번 주 진행을 보여 주고, 정복 결과로 이어 간다', async () => {
    mockApi({});
    const { router } = renderRoute('/visits/31/quest', {
      state: rating({
        completed: [completed],
        week: { baseCount: 3, doneCount: 2, boxId: null, streak: 2 },
        bonusQuest: null,
        achievements: [],
      }),
    });
    expect(await screen.findByText('새 맛 탐험 성공!')).toBeInTheDocument();
    expect(screen.getByText('옛날순대국을 정복했어요')).toBeInTheDocument();
    expect(screen.getByText('+100P 받았어요')).toBeInTheDocument();
    expect(screen.getByText('1개 더 깨면 주간 아이템 상자를 받아요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '정복 결과 보기' }));
    expect(await screen.findByText('옛날순대국, 정복 완료!')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/visits/31/conquered');
  });

  it('이번 주를 모두 깨면 주간 상자·연속 기록·보너스 퀘스트, 나중에 열기는 정복 결과로', async () => {
    mockApi({});
    renderRoute('/visits/31/quest', {
      state: rating({
        completed: [completed],
        week: { baseCount: 3, doneCount: 3, boxId: 9, streak: 3 },
        bonusQuest: {
          questId: 40,
          typeName: '첫 평가자',
          title: '화곡동 칼국수 첫 평가자 되기',
          summary: '인증 리뷰가 2개뿐인 곳이에요',
          rewardPoint: 50,
        },
        achievements: [],
      }),
    });
    expect(
      await screen.findByText('이번 주 퀘스트를 모두 깼어요! 주간 상자를 받으세요'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '주간 상자 받기' }));
    expect(await screen.findByText('주간 아이템 상자를 받았어요')).toBeInTheDocument();
    expect(screen.getByText('3주 연속 완료 중')).toBeInTheDocument();
    expect(
      screen.getByText('1주 더 연속으로 완료하면 칭호 "꾸준한 탐험가"를 받아요'),
    ).toBeInTheDocument();
    expect(screen.getByText('첫 평가자 · 화곡동 칼국수 첫 평가자 되기 · +50P')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '나중에 열기 (아이템 상자 목록에 보관)' }));
    expect(await screen.findByText('옛날순대국, 정복 완료!')).toBeInTheDocument();
  });

  it('퀘스트를 안 깼으면 바로 정복 결과', async () => {
    mockApi({});
    const { router } = renderRoute('/visits/31/quest', { state: rating(null) });
    expect(await screen.findByText('옛날순대국, 정복 완료!')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/visits/31/conquered');
  });
});

describe('퀘스트 기록 · 설정 (M2·M3)', () => {
  it('연속 완료·통계·지난 주를 보여 준다', async () => {
    mockApi({
      'GET /quests/records': ok({
        streak: 3,
        thisWeekDone: false,
        streakGoal: { name: '꾸준한 탐험가', target: 4, achieved: false },
        placesGoal: { name: '새 맛 수집가', target: 10, achieved: false },
        completedCount: 14,
        placeCount: 8,
        pointTotal: 1250,
        weeks: [
          week({ weekId: 5 }),
          week({
            weekId: 4,
            isCurrent: false,
            startDate: '2026-11-02',
            endDate: '2026-11-08',
            doneCount: 3,
            boxReceived: true,
          }),
          week({
            weekId: 3,
            isCurrent: false,
            startDate: '2026-10-26',
            endDate: '2026-11-01',
            baseCount: 2,
            doneCount: 1,
          }),
        ],
      }),
    });
    renderRoute('/me/quests');
    expect(await screen.findByText('3주 연속 완료 중')).toBeInTheDocument();
    expect(screen.getByText('이번 주까지 깨면 칭호 "꾸준한 탐험가"')).toBeInTheDocument();
    expect(screen.getByText('14개')).toBeInTheDocument();
    expect(screen.getByText('1,250P')).toBeInTheDocument();
    expect(screen.getByText('업적 "새 맛 수집가"까지 퀘스트로 2곳 더')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /이번 주 · 11.9 ~ 11.15/ })).toHaveAttribute(
      'href',
      '/me/quests/5',
    );
    expect(screen.getByText('3/3 완료 · 주간 상자 받음')).toBeInTheDocument();
    expect(screen.getByText('1/2 · 상자 못 받음')).toBeInTheDocument();
  });

  it('설정에서 맞춤 퀘스트를 끈다', async () => {
    const server = mockApi({
      'GET /users/me': ok(me),
      'GET /users/me/taste-weights': ok({ items: [] }),
      'GET /users/me/settings': ok({
        notification: {
          conquestAlarm: true,
          rankAlarm: true,
          marketingAlarm: false,
          crewAlarm: true,
          marketingConsentChangedAt: null,
        },
        personalization: { questEnabled: true, personalizedReco: true },
        localRegions: [],
        account: { provider: 'KAKAO', joinedAt: '2026-10-01T00:00:00+09:00' },
      }),
      'PATCH /users/me/notification-settings': ok(
        {
          conquestAlarm: true,
          rankAlarm: true,
          marketingAlarm: false,
          marketingConsentChangedAt: null,
          questEnabled: false,
          personalizedReco: true,
        },
        '설정을 바꿨어요.',
      ),
    });
    renderRoute('/me/settings');
    const section = await screen.findByRole('region', { name: '맞춤 퀘스트 · 모임' });
    fireEvent.click(await within(section).findByRole('switch', { name: '맞춤 퀘스트' }));
    expect(await screen.findByText('설정을 바꿨어요.')).toBeInTheDocument();
    expect(server.calls('PATCH /users/me/notification-settings')[0].body).toEqual({
      questEnabled: false,
    });
  });
});
