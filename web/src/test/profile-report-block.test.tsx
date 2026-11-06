import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MemberProfile } from '../api/profile';
import type { Review } from '../api/reviews';
import { mockApi, ok } from './http';
import { renderRoute } from './render';

const profile = (patch: Partial<MemberProfile> = {}): MemberProfile => ({
  userId: 5,
  nickname: '동네미식가',
  profileImageUrl: null,
  bio: '강서구 토박이 10년차, 국밥 · 칼국수 위주로 다녀요.',
  trustTemp: 51,
  title: '강서구 단골',
  homeRegion: '강서구 가양동',
  mukkaebi: {
    level: 12,
    exp: 1840,
    levelExp: 1500,
    nextLevelExp: 2000,
    stage: 'KID',
    stageName: '어린이',
    equipped: {
      hat: { itemId: 9, code: 'HAT_CROWN', name: '왕관', rarity: 'H' },
      face: null,
      prop: null,
      skin: null,
      club: null,
    },
    background: null,
  },
  currentSeason: {
    seasonId: 3,
    seasonNo: 3,
    conquestCount: 18,
    best: {
      sigunguId: 2,
      sigunguName: '강서구',
      rank: 1,
      tier: 'MUKJJANG',
      tierTitle: '강서구의 먹짱',
    },
  },
  totalConquestCount: 57,
  helpfulReceived: 316,
  seasonTitles: [],
  achievements: {
    achievedCount: 9,
    totalCount: 12,
    recent: [
      {
        achievementId: 1,
        name: '구의 먹짱',
        description: null,
        iconKey: null,
        achievedAt: '2026-08-31T00:00:00+09:00',
      },
    ],
  },
  counts: { visitedRestaurants: 57, reviews: 42, picks: 1 },
  picks: [
    {
      order: 1,
      restaurantId: 7,
      name: '옛날손칼국수',
      categoryName: '칼국수',
      sigunguName: '강서구',
      dongName: '가양동',
      lat: 37.5,
      lng: 126.8,
      comment: '비 오는 날엔 무조건 여기',
      visitCount: 6,
    },
  ],
  isMe: false,
  isBlocked: false,
  ...patch,
});

const page = <T,>(items: T[]) => ({
  items,
  page: 1,
  size: 10,
  totalCount: items.length,
  hasNext: false,
});

const review = (patch: Partial<Review> = {}): Review => ({
  reviewId: 50,
  restaurant: {
    restaurantId: 7,
    name: '옛날손칼국수',
    categoryName: '칼국수',
    sigunguName: '강서구',
    dongName: '가양동',
  },
  author: {
    userId: 5,
    nickname: '동네미식가',
    profileImageUrl: null,
    trustTemp: 51,
    title: '강서구의 먹짱',
    isLocal: true,
  },
  verificationMethod: 'RECEIPT',
  visitedAt: '2026-09-10T12:00:00+09:00',
  overallScore: 5,
  detailScores: null,
  aspects: [],
  content: '면을 직접 뽑아서 쫄깃해요.',
  imageUrls: [],
  imageCount: 0,
  helpfulCount: 34,
  myReaction: null,
  isMine: false,
  isRevisit: false,
  regDate: '2026-09-10T13:00:00+09:00',
  updatedAt: null,
  ...patch,
});

describe('탐방러 프로필 (PROFILE-01·02, REVIEW-10)', () => {
  it('먹깨비·칭호·소개글·레벨·기록과 PICK을 보여 주고, 리뷰 탭은 정렬을 바꿔 부른다', async () => {
    const server = mockApi({
      'GET /users/:id/profile': ok(profile()),
      'GET /users/:id/reviews': ok(page([review()])),
    });
    renderRoute('/users/5');

    const hero = await screen.findByRole('region', { name: '동네미식가의 프로필' });
    expect(hero).toHaveTextContent('강서구의 먹짱');
    expect(hero).toHaveTextContent('강서구 가양동 · 신뢰 온도 51.0° · 시즌 3 강서구 1위');
    expect(hero).toHaveTextContent('강서구 토박이 10년차');
    expect(hero).toHaveTextContent('LV.12');
    expect(hero).toHaveTextContent('1,840 / 2,000');
    expect(hero).toHaveTextContent('어린이 먹깨비 · 왕관');
    expect(screen.getByText('시즌 3 정복').nextElementSibling).toHaveTextContent('18곳');
    expect(screen.getByRole('region', { name: '업적' })).toHaveTextContent('12개 중 9개');

    // PICK이 있으면 PICK 탭부터
    expect(screen.getByRole('tab', { name: 'PICK 1' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('link', { name: /옛날손칼국수.*방문 인증 6회/ })).toHaveAttribute(
      'href',
      '/restaurants/7',
    );

    fireEvent.click(screen.getByRole('tab', { name: '리뷰 42' }));
    expect(await screen.findByRole('article', { name: '동네미식가의 리뷰' })).toBeInTheDocument();
    expect(server.calls('GET /users/:id/reviews')[0]).toMatchObject({ path: '/users/5/reviews' });
    fireEvent.change(screen.getByRole('combobox', { name: '정렬' }), {
      target: { value: 'HELPFUL' },
    });
    await waitFor(() =>
      expect(server.calls('GET /users/:id/reviews').at(-1)?.query.get('sort')).toBe('HELPFUL'),
    );
  });

  it('다녀온 가게 탭: 이번 시즌 정복한 가게와 맛 별점, 시즌·구를 고르면 다시 부른다', async () => {
    const server = mockApi({
      'GET /seasons': ok({
        items: [
          {
            seasonId: 3,
            seasonNo: 3,
            name: '시즌 3',
            startDate: '2026-09-01',
            endDate: '2027-02-28',
            status: 'ACTIVE',
            daysLeft: 100,
          },
          {
            seasonId: 2,
            seasonNo: 2,
            name: '시즌 2',
            startDate: '2026-03-01',
            endDate: '2026-08-31',
            status: 'FINALIZED',
            daysLeft: 0,
          },
        ],
      }),
      'GET /users/:id/profile': ok(
        profile({ picks: [], counts: { visitedRestaurants: 1, reviews: 0, picks: 0 } }),
      ),
      'GET /users/:id/visited-restaurants': ok({
        ...page([
          {
            restaurantId: 8,
            name: '새맛집',
            categoryName: '한식',
            sigunguName: '강서구',
            dongName: '가양동',
            overallScore: 4.8,
            reviewId: 60,
            conqueredAt: '2026-09-16T12:00:00+09:00',
          },
        ]),
        seasonId: 3,
        sigunguId: null,
        sigungus: [
          { sigunguId: 3, sigunguName: '강서구', conquestCount: 1 },
          { sigunguId: 9, sigunguName: '중구', conquestCount: 1 },
        ],
        isMe: false,
      }),
    });
    renderRoute('/users/5');

    const row = await screen.findByRole('link', { name: /새맛집/ });
    expect(screen.getByRole('tab', { name: '다녀온 가게 1' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(row).toHaveTextContent('맛 ★ 4.8');
    expect(row).toHaveTextContent('9.16 방문');
    expect(row).toHaveAttribute('href', '/reviews/60');

    fireEvent.change(screen.getByRole('combobox', { name: '구' }), { target: { value: '9' } });
    await waitFor(() =>
      expect(
        server.calls('GET /users/:id/visited-restaurants').at(-1)?.query.get('sigunguId'),
      ).toBe('9'),
    );
    // 시즌을 바꾸면 구는 전체로 돌아간다
    fireEvent.change(await screen.findByRole('combobox', { name: '시즌' }), {
      target: { value: '2' },
    });
    await waitFor(() => {
      const query = server.calls('GET /users/:id/visited-restaurants').at(-1)?.query;
      expect(query?.get('seasonId')).toBe('2');
      expect(query?.get('sigunguId')).toBeNull();
    });
  });

  it('••• → 차단하기 → 리뷰 대신 차단 안내, 다시 풀 수 있다 (BLOCK-01·02)', async () => {
    const server = mockApi({
      'GET /users/:id/profile': ok(profile()),
      'PUT /users/me/blocks/:id': ok(
        { userId: 5, isBlocked: true },
        '차단했어요. 이 탐험가의 리뷰가 보이지 않아요.',
      ),
      'DELETE /users/me/blocks/:id': ok({ userId: 5, isBlocked: false }, '차단을 풀었어요.'),
    });
    renderRoute('/users/5');

    fireEvent.click(await screen.findByRole('button', { name: '신고·차단' }));
    const sheet = screen.getByRole('dialog', { name: '동네미식가' });
    fireEvent.click(within(sheet).getByRole('button', { name: /차단하기/ }));

    expect(
      await screen.findByText('차단한 탐험가예요. 이 탐험가의 리뷰가 보이지 않아요.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(server.calls('PUT /users/me/blocks/:id')[0].path).toBe('/users/me/blocks/5');

    fireEvent.click(screen.getByRole('button', { name: '차단 풀기' }));
    expect(await screen.findByRole('tablist', { name: '탐방러 기록' })).toBeInTheDocument();
    expect(server.calls('DELETE /users/me/blocks/:id')).toHaveLength(1);
  });

  it('내 프로필이면 신고·차단 대신 프로필 수정', async () => {
    mockApi({ 'GET /users/:id/profile': ok(profile({ isMe: true })) });
    renderRoute('/users/5');
    expect(await screen.findByRole('link', { name: '프로필 수정' })).toHaveAttribute(
      'href',
      '/me/profile',
    );
    expect(screen.queryByRole('button', { name: '신고·차단' })).not.toBeInTheDocument();
  });
});

describe('신고하기 (REPORT-01)', () => {
  it('탐험가: 이유를 골라야 보낼 수 있고, 자세한 내용과 함께 보낸다', async () => {
    const server = mockApi({
      'GET /users/:id/profile': ok(profile()),
      'POST /reports': ok(
        { reportId: 1, status: 'RECEIVED' },
        '신고를 접수했어요. 확인 후 조치할게요.',
      ),
    });
    const { router } = renderRoute('/users/5');

    fireEvent.click(await screen.findByRole('button', { name: '신고·차단' }));
    fireEvent.click(screen.getByRole('button', { name: /신고하기/ }));
    expect(
      await screen.findByText(/동네미식가님을 신고하는 이유를 골라 주세요/),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/users/5/report');

    const submit = screen.getByRole('button', { name: '신고 접수하기' });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: '가짜 리뷰 (영수증과 다른 내용)' }));
    fireEvent.change(screen.getByLabelText('자세한 내용 (선택)'), {
      target: { value: '새맛집 리뷰가 실제 메뉴와 달라요' },
    });
    expect(screen.getByText('18 / 200')).toBeInTheDocument();
    fireEvent.click(submit);

    await waitFor(() => expect(router.state.location.pathname).toBe('/users/5'));
    expect(server.calls('POST /reports')[0].body).toEqual({
      targetType: 'MEMBER',
      targetId: 5,
      reason: 'FAKE',
      detail: '새맛집 리뷰가 실제 메뉴와 달라요',
    });
    expect(await screen.findByText('신고를 접수했어요. 확인 후 조치할게요')).toBeInTheDocument();
  });

  it('링크로 바로 들어와 신고하면 앱 밖이 아니라 그 탐험가 프로필로 간다', async () => {
    mockApi({
      'GET /users/:id/profile': ok(profile()),
      'POST /reports': ok({ reportId: 3, status: 'RECEIVED' }, '신고를 접수했어요.'),
    });
    const { router } = renderRoute('/users/5/report');

    fireEvent.click(await screen.findByRole('radio', { name: '스팸 · 광고' }));
    fireEvent.click(screen.getByRole('button', { name: '신고 접수하기' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/users/5'));
  });

  it('남의 리뷰 상세에서 리뷰를 신고한다', async () => {
    const server = mockApi({
      'GET /reviews/:id': ok(review()),
      'POST /reports': ok({ reportId: 2, status: 'RECEIVED' }, '신고를 접수했어요.'),
    });
    renderRoute('/reviews/50');

    fireEvent.click(await screen.findByRole('link', { name: '신고' }));
    expect(await screen.findByText(/동네미식가님의 리뷰를 신고하는/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '욕설 · 비방' }));
    fireEvent.click(screen.getByRole('button', { name: '신고 접수하기' }));
    await waitFor(() =>
      expect(server.calls('POST /reports')[0]?.body).toEqual({
        targetType: 'REVIEW',
        targetId: 50,
        reason: 'ABUSE',
        detail: null,
      }),
    );
  });

  it('리뷰 작성자 닉네임을 누르면 탐방러 프로필로 간다', async () => {
    mockApi({ 'GET /restaurants/:id/reviews': ok(page([review()])) });
    renderRoute('/restaurants/7/reviews');
    expect(await screen.findByRole('link', { name: '동네미식가' })).toHaveAttribute(
      'href',
      '/users/5',
    );
  });
});

describe('프로필 수정 — 사진·소개글 (USER-02·05·06·07)', () => {
  const me = {
    id: 1,
    nickname: '아기깨비',
    nicknameChangeableAt: null,
    profileImageUrl: null,
    profileImageSource: 'DEFAULT',
    bio: null,
    gender: 'M',
    ageGroup: 20,
    status: 'A',
    localRegions: [],
    regDate: '2026-10-01',
  };

  it('사진을 고르면 바로 올려 바꾸고, 기본 캐릭터로 되돌릴 수 있다', async () => {
    const server = mockApi({
      'GET /users/me': ok(me),
      'POST /users/me/profile-image/upload-url': ok({
        uploadUrl: 'https://storage.test/upload',
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        imageKey: 'profile/1/a.png',
        expiresIn: 300,
      }),
      'PUT /upload': ok(null),
      'PUT /users/me/profile-image': ok(
        { profileImageUrl: 'https://img.test/profile/1/a.png', profileImageSource: 'CUSTOM' },
        '프로필 사진을 바꿨어요.',
      ),
      'DELETE /users/me/profile-image': ok(
        { profileImageUrl: null, profileImageSource: 'DEFAULT' },
        '기본 캐릭터로 바꿨어요.',
      ),
    });
    renderRoute('/me/profile');

    fireEvent.click(await screen.findByRole('button', { name: '프로필 사진 변경' }));
    expect(screen.getByRole('dialog', { name: '프로필 사진' })).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('profile-photo-input'), {
      target: { files: [new File(['png'], 'me.png', { type: 'image/png' })] },
    });
    expect(await screen.findByRole('img', { name: '내 프로필 사진' })).toHaveAttribute(
      'src',
      'https://img.test/profile/1/a.png',
    );
    expect(server.calls('POST /users/me/profile-image/upload-url')[0].body).toEqual({
      contentType: 'image/png',
      fileSize: 3,
    });
    expect(server.calls('PUT /users/me/profile-image')[0].body).toEqual({
      imageKey: 'profile/1/a.png',
    });

    fireEvent.click(screen.getByRole('button', { name: '프로필 사진 변경' }));
    fireEvent.click(screen.getByRole('button', { name: '기본 캐릭터(먹깨비)로 바꾸기' }));
    await waitFor(() =>
      expect(screen.queryByRole('img', { name: '내 프로필 사진' })).not.toBeInTheDocument(),
    );

    // 브라우저가 형식을 비워 주면 확장자로 정한다
    fireEvent.change(screen.getByTestId('profile-photo-input'), {
      target: { files: [new File(['webp'], 'me.WEBP', { type: '' })] },
    });
    await waitFor(() =>
      expect(server.calls('POST /users/me/profile-image/upload-url').at(-1)?.body).toEqual({
        contentType: 'image/webp',
        fileSize: 4,
      }),
    );
  });

  it('소개글을 쓰면 저장할 때 함께 보낸다 (60자까지)', async () => {
    const server = mockApi({
      'GET /users/me': ok(me),
      'PATCH /users/me': ok({ ...me, bio: '국밥 위주로 다녀요' }, '프로필을 저장했어요.'),
    });
    renderRoute('/me/profile');

    const bio = await screen.findByLabelText('소개글');
    fireEvent.change(bio, { target: { value: '가'.repeat(70) } });
    expect((bio as HTMLTextAreaElement).value).toHaveLength(60);
    expect(screen.getByText('60/60')).toBeInTheDocument();

    fireEvent.change(bio, { target: { value: '  국밥 위주로 다녀요 ' } });
    fireEvent.click(screen.getAllByRole('button', { name: '저장하기' })[0]);
    await waitFor(() =>
      expect(server.calls('PATCH /users/me')[0]?.body).toEqual({ bio: '국밥 위주로 다녀요' }),
    );
  });
});
