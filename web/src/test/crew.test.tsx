import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CrewMember, CrewQuest, CrewSpace } from '../api/crews';
import type { QuestWeek } from '../api/quests';
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

const localRegion = {
  localRegionId: 1,
  regionId: 11,
  dongName: '가양동',
  sigunguId: 2,
  sigunguName: '강서구',
  sortOrder: 0,
  regDate: '2026-10-01',
};

const me = { id: 1, nickname: '아기깨비', localRegions: [localRegion] };

const member = (userId: number, nickname: string, over: Partial<CrewMember> = {}): CrewMember => ({
  userId,
  nickname,
  profileImageUrl: null,
  hatCode: null,
  status: 'JOINED',
  isMe: userId === 1,
  ...over,
});

const members = [member(1, '아기깨비'), member(2, '준호'), member(3, '수영')];

const head = {
  crewId: 9,
  type: 'FRIEND' as const,
  typeName: '친구',
  name: '우리 과 동기',
  sigunguId: 2,
  sigunguName: '강서구',
  memberCount: 3,
  maxMembers: 8,
  isOwner: true,
};

const together = (over: Partial<CrewQuest> = {}): CrewQuest => ({
  crewQuestId: 1,
  type: 'TOGETHER',
  typeName: '함께 정복',
  title: '모두 안 가 본 파스타집',
  summary: '화곡동 파스타 · 모두의 만족 4.3',
  rewardPoint: 100,
  status: 'ACTIVE',
  target: 2,
  progress: 0,
  restaurantId: 7,
  restaurantName: '화곡동 파스타',
  participants: [],
  ...over,
});

const split = (over: Partial<CrewQuest> = {}): CrewQuest => ({
  crewQuestId: 2,
  type: 'SPLIT',
  typeName: '맛집 나눠 찾기',
  title: '각자 다른 곳 1곳씩 정복',
  summary: '강서구 안에서 3명이 겹치지 않게',
  rewardPoint: 80,
  status: 'ACTIVE',
  target: 3,
  progress: 1,
  restaurantId: null,
  restaurantName: null,
  participants: [{ userId: 2, nickname: '준호' }],
  ...over,
});

const space = (over: Partial<CrewSpace> = {}): CrewSpace => ({
  ...head,
  inviteCode: 'MJK-4821',
  members,
  conquestCount: 3,
  quests: [together(), split()],
  conquests: [
    {
      crewConquestId: 31,
      date: '2026-10-28',
      restaurantId: 5,
      name: '옛날손칼국수',
      lat: 37.56,
      lng: 126.85,
      tasteScore: 4.6,
      members: [
        { userId: 1, nickname: '아기깨비' },
        { userId: 2, nickname: '준호' },
      ],
    },
    {
      crewConquestId: 30,
      date: '2026-10-14',
      restaurantId: 6,
      name: '마포숯불갈비',
      lat: 37.561,
      lng: 126.851,
      tasteScore: 4.4,
      members: [
        { userId: 1, nickname: '아기깨비' },
        { userId: 3, nickname: '수영' },
      ],
    },
    {
      crewConquestId: 29,
      date: '2026-10-02',
      restaurantId: 8,
      name: '등촌 국밥',
      lat: 37.562,
      lng: 126.852,
      tasteScore: null,
      members: [
        { userId: 2, nickname: '준호' },
        { userId: 3, nickname: '수영' },
      ],
    },
  ],
  badges: [{ code: 'FIRST_FEAST', name: '첫 만찬' }],
  nextBadge: { code: 'EXPLORERS', name: '강서 탐험대', target: 5 },
  ...over,
});

const week: QuestWeek = {
  weekId: 5,
  startDate: '2026-11-09',
  endDate: '2026-11-15',
  isCurrent: true,
  daysLeft: 4,
  activity: 'LOW',
  activityName: '활동 적음',
  baseCount: 2,
  doneCount: 0,
  bonusDoneCount: 0,
  swapAvailable: true,
  boxReceived: false,
};

beforeEach(() => {
  resetViewRegionForTest();
  setMyCoordsForTest(null);
  localStorage.clear();
});

describe('퀘스트 시트 모임 퀘스트 탭 (G1)', () => {
  it('모임을 골라 모임 퀘스트를 보고, 모임 공간·새 모임으로 간다', async () => {
    mockApi({
      'GET /users/me': ok(me),
      'GET /regions/search': ok({ keyword: '', items: [GAYANG], totalCount: 1 }),
      'GET /map/restaurants': ok({ items: [], totalCount: 0, truncated: false }),
      'GET /quests/current': ok({ enabled: true, week, quests: [], streak: 0 }),
      'GET /crews/quests': ok({
        items: [
          { ...head, members, quests: [together(), split()] },
          {
            ...head,
            crewId: 10,
            type: 'COUPLE',
            typeName: '연인',
            name: '민지',
            memberCount: 1,
            maxMembers: 2,
            members: [member(1, '아기깨비')],
            quests: [],
          },
        ],
      }),
    });
    renderRoute('/');
    fireEvent.click(await screen.findByRole('button', { name: '이번 주 퀘스트 0/2' }));
    const sheet = await screen.findByRole('dialog', { name: '이번 주 퀘스트' });
    expect(within(sheet).getByRole('tab', { name: '내 퀘스트 0/2' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.click(await within(sheet).findByRole('tab', { name: '모임 퀘스트 · 2' }));

    expect(within(sheet).getByRole('button', { name: /우리 과 동기 3/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const card = within(sheet).getByRole('link', { name: /모두 안 가 본 파스타집/ });
    expect(card).toHaveAttribute('href', '/restaurants/7');
    expect(within(card).getByText('2명 이상 같이 가면 완료')).toBeInTheDocument();
    expect(within(card).getByText('각자')).toBeInTheDocument();
    expect(within(sheet).getByText('1/3 완료 · 나, 수영 남음')).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: '모임 공간 열기' })).toHaveAttribute(
      'href',
      '/crews/9',
    );
    expect(within(sheet).getByRole('link', { name: '새 모임 만들기' })).toHaveAttribute(
      'href',
      '/crews/new',
    );

    // 혼자인 모임은 초대부터
    fireEvent.click(within(sheet).getByRole('button', { name: /민지 1/ }));
    expect(
      within(sheet).getByText(/모임원이 2명 이상이면 모임 퀘스트를 받아요/),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: '모임원 초대하기' })).toHaveAttribute(
      'href',
      '/crews/10/invite',
    );
  });
});

describe('모임 만들기·초대 (G2·G3)', () => {
  it('종류 → 이름·동네 → 만들면 초대 화면에서 코드·닉네임으로 초대한다', async () => {
    const created = space({ members: [member(1, '아기깨비')], memberCount: 1, quests: [] });
    const server = mockApi({
      'GET /users/me/local-regions': ok({
        items: [localRegion],
        minCount: 1,
        maxCount: 3,
        canChange: true,
        nextChangeAvailableAt: null,
      }),
      'POST /crews': ok(created, '모임을 만들었어요.'),
      'GET /crews/:id': ok(created),
      'POST /crews/:id/invites': ok({ userId: 2, nickname: '준호', status: 'INVITED' }),
    });
    const { router } = renderRoute('/crews/new');

    expect(await screen.findByText('누구와 함께해요?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /친구/ }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    fireEvent.change(await screen.findByLabelText('모임 이름'), {
      target: { value: '우리 과 동기' },
    });
    expect(await screen.findByRole('radio', { name: /강서구/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: '모임 만들기' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/crews/9/invite'));
    expect(server.calls('POST /crews')[0].body).toEqual({
      type: 'FRIEND',
      name: '우리 과 동기',
      sigunguId: 2,
    });

    expect(await screen.findByText('MJK-4821')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닉네임 검색' }));
    fireEvent.change(screen.getByLabelText('초대할 닉네임'), { target: { value: '준호' } });
    fireEvent.click(screen.getByRole('button', { name: '초대' }));
    expect(await screen.findByText('준호님을 초대했어요')).toBeInTheDocument();
    expect(server.calls('POST /crews/:id/invites')[0].body).toEqual({ nickname: '준호' });
  });
});

describe('모임 초대 받기 (G4)', () => {
  it('받은 초대에서 참여하면 모임 공간으로', async () => {
    const server = mockApi({
      'GET /crews/:id/invitation': ok({ ...head, members, inviterNickname: '지현' }),
      'POST /crews/:id/invitation': ok(space()),
      'GET /crews/:id': ok(space()),
    });
    const { router } = renderRoute('/crews/9/invitation');
    expect(await screen.findByText('지현님이 "우리 과 동기"에 초대했어요')).toBeInTheDocument();
    expect(screen.getByText('친구 모임')).toBeInTheDocument();
    expect(screen.getByText('3명 참여 중')).toBeInTheDocument();
    expect(screen.getByText(/안 보여요 · 방문 시간, 지금 위치/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '참여하기' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/crews/9'));
    expect(server.calls('POST /crews/:id/invitation')[0].body).toEqual({ accept: true });
  });

  it('초대 링크(코드)로 들어오면 미리 보고 참여한다', async () => {
    const server = mockApi({
      'GET /crews/join/:code': ok({ ...head, members, myStatus: null }),
      'POST /crews/join/:code': ok(space()),
      'GET /crews/:id': ok(space()),
    });
    const { router } = renderRoute('/crews/join?code=mjk-4821');
    expect(await screen.findByText('"우리 과 동기" 모임에 들어갈까요?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '참여하기' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/crews/9'));
    expect(server.calls('POST /crews/join/:code')[0].path).toContain('/crews/join/MJK-4821');
  });
});

describe('모임 공간 (G5)', () => {
  it('모임원·이번 주 모임 퀘스트·함께 정복한 곳·배지를 보여 주고, 나갈 수 있다', async () => {
    const server = mockApi({
      'GET /crews/:id': ok(space()),
      'DELETE /crews/:id/members/me': ok(null, '모임에서 나왔어요.'),
      'GET /crews': ok({ crews: [], invitations: [] }),
    });
    const { router } = renderRoute('/crews/9');
    expect(await screen.findByText('함께 정복 3곳 · 모임 배지 1개')).toBeInTheDocument();
    expect(screen.getByText('함께 정복 · 화곡동 파스타')).toBeInTheDocument();
    expect(screen.getByText('2명 이상 같이 가면 완료 · 각자 +100P')).toBeInTheDocument();
    expect(screen.getByText('1/3 완료 · 각자 +80P')).toBeInTheDocument();
    expect(screen.getByText('10.28 · 2명 함께')).toBeInTheDocument();
    expect(screen.getByText('★ 4.6 맛')).toBeInTheDocument();
    // 목록은 2곳만, 나머지는 모두 보기 (지도에는 모두)
    const list = screen.getByRole('region', { name: '함께 정복한 곳' });
    expect(within(list).queryByText('등촌 국밥')).not.toBeInTheDocument();
    fireEvent.click(within(list).getByRole('button', { name: '3곳 모두 보기 ›' }));
    expect(within(list).getByText('등촌 국밥')).toBeInTheDocument();
    expect(screen.getByText('모임 배지 · 첫 만찬')).toBeInTheDocument();
    expect(
      screen.getByText('함께 정복 5곳이면 "강서 탐험대" 배지를 받아요 (3/5)'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '모임 나가기' }));
    fireEvent.click(await screen.findByRole('button', { name: '나가기' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/me/crews'));
    expect(server.calls('DELETE /crews/:id/members/me')).toHaveLength(1);
  });
});

describe('함께 정복 완료 (G6)', () => {
  const rating = {
    reviewId: 50,
    visitId: 31,
    overallScore: 4.5,
    restaurant: { restaurantId: 7, name: '화곡동 파스타' },
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
    quest: null,
    crew: {
      together: [
        {
          crewId: 9,
          crewName: '우리 과 동기',
          partners: ['지현', '수영'],
          restaurantName: '화곡동 파스타',
          conquestCount: 7,
          badges: ['첫 만찬'],
          rewardPoint: 100,
        },
      ],
    },
  };

  it('같이 간 모임원·각자 받은 포인트·배지를 보여 주고 정복 결과로 이어 간다', async () => {
    mockApi({});
    const { router } = renderRoute('/visits/31/together', { state: rating });
    expect(await screen.findByText('함께 정복 완료!')).toBeInTheDocument();
    expect(screen.getByText('지현 · 수영과 화곡동 파스타를 정복했어요')).toBeInTheDocument();
    expect(screen.getByText('+100P 각자 받았어요')).toBeInTheDocument();
    expect(screen.getByText('모임 배지 "첫 만찬"')).toBeInTheDocument();
    expect(screen.getByText('우리 과 동기 · 함께 정복 7곳째')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '정복 결과 보기' }));
    expect(await screen.findByText('화곡동 파스타, 정복 완료!')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/visits/31/conquered');
  });

  it('함께 정복이 없으면 바로 다음 화면', async () => {
    mockApi({});
    const { router } = renderRoute('/visits/31/together', { state: { ...rating, crew: null } });
    expect(await screen.findByText('화곡동 파스타, 정복 완료!')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/visits/31/conquered');
  });
});

describe('내 모임 (M1)', () => {
  it('참여 중인 모임과 받은 초대를 보여 준다', async () => {
    mockApi({
      'GET /crews': ok({
        crews: [{ ...head, members, conquestCount: 6, activeQuestCount: 2 }],
        invitations: [
          {
            ...head,
            crewId: 12,
            name: '점심 메이트',
            isOwner: false,
            inviterNickname: '지현',
          },
        ],
      }),
    });
    renderRoute('/me/crews');
    const card = await screen.findByRole('link', { name: /우리 과 동기/ });
    expect(card).toHaveAttribute('href', '/crews/9');
    expect(within(card).getByText('3명 · 강서구 · 함께 정복 6곳')).toBeInTheDocument();
    expect(within(card).getByText('이번 주 퀘스트 2개')).toBeInTheDocument();
    expect(screen.getByText('받은 초대 1개')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /점심 메이트/ })).toHaveAttribute(
      'href',
      '/crews/12/invitation',
    );
    expect(screen.getByRole('link', { name: /초대 코드로 참여/ })).toHaveAttribute(
      'href',
      '/crews/join',
    );
  });
});
