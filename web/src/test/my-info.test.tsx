import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getSession } from '../lib/session';
import { fail, mockApi, ok } from './http';
import { renderRoute } from './render';

const lr = (localRegionId: number, regionId: number, dongName: string, sigunguName: string) => ({
  localRegionId,
  regionId,
  dongName,
  sigunguId: 2,
  sigunguName,
  sortOrder: localRegionId - 1,
  regDate: '2026-10-01',
});

const me = {
  id: 1,
  nickname: '아기깨비',
  nicknameChangeableAt: null,
  profileImageUrl: null,
  profileImageSource: 'DEFAULT',
  gender: 'M',
  ageGroup: 20,
  status: 'A',
  localRegions: [lr(1, 11, '가양동', '강서구'), lr(2, 12, '망원동', '마포구')],
  regDate: '2026-10-01',
};

const regions = (canChange = true) => ({
  items: me.localRegions,
  minCount: 1,
  maxCount: 2,
  canChange,
  nextChangeAvailableAt: canChange ? null : '2027-01-01',
});

describe('내 정보 (USER-04)', () => {
  it('프로필 카드에 닉네임·첫 동네·성별·나이대를 보여 준다', async () => {
    mockApi({ 'GET /users/me': ok(me) });
    renderRoute('/me');

    expect(await screen.findByText('아기깨비')).toBeInTheDocument();
    expect(screen.getByText('강서구 가양동 · 남성 · 20대')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '프로필 수정' })).toHaveAttribute(
      'href',
      '/me/profile',
    );
    expect(screen.getByRole('link', { name: '설정' })).toHaveAttribute('href', '/me/settings');
  });
});

describe('프로필 수정 (USER-05)', () => {
  it('바꾼 값만 보내고, 닉네임은 중복 확인을 통과해야 저장할 수 있다', async () => {
    const server = mockApi({
      'GET /users/me': ok(me),
      'GET /users/nickname/availability': ok(
        { nickname: '새깨비', available: true, reason: null },
        '사용할 수 있는 닉네임이에요.',
      ),
      'PATCH /users/me': ok(
        {
          id: 1,
          nickname: '새깨비',
          nicknameChangeableAt: '2026-11-27',
          gender: 'M',
          ageGroup: 30,
        },
        '프로필을 저장했어요.',
      ),
    });
    const { router } = renderRoute('/me/profile');

    const nickname = await screen.findByLabelText('닉네임');
    const [save] = screen.getAllByRole('button', { name: '저장하기' });
    expect(save).toBeDisabled(); // 바꾼 게 없다

    fireEvent.change(nickname, { target: { value: '새깨비' } });
    fireEvent.click(screen.getByRole('radio', { name: '30대' }));
    expect(save).toBeDisabled(); // 중복 확인 전
    await screen.findByText(/사용할 수 있는 닉네임이에요/, {}, { timeout: 2000 });
    fireEvent.click(save);

    await waitFor(() => expect(router.state.location.pathname).toBe('/me'));
    expect(server.calls('PATCH /users/me')[0].body).toEqual({ nickname: '새깨비', ageGroup: 30 });
    expect(await screen.findByText('프로필을 저장했어요')).toBeInTheDocument();
  });

  it('30일이 지나지 않았으면 닉네임을 고칠 수 없고 바꿀 수 있는 날을 알려 준다', async () => {
    mockApi({ 'GET /users/me': ok({ ...me, nicknameChangeableAt: '2026-11-20T10:00:00+09:00' }) });
    renderRoute('/me/profile');

    expect(await screen.findByLabelText('닉네임')).toHaveAttribute('readonly');
    expect(screen.getByText('닉네임은 2026.11.20부터 바꿀 수 있어요')).toBeInTheDocument();
  });
});

describe('내 동네 관리 (LOCAL-01·02·03)', () => {
  it('동네를 빼기 전에 확인하고, 빼면 목록을 바꾼다', async () => {
    const server = mockApi({
      'GET /users/me/local-regions': ok(regions()),
      'DELETE /users/me/local-regions/:id': ok(
        { items: [me.localRegions[0]], canChange: false, nextChangeAvailableAt: '2027-01-01' },
        '내 동네에서 뺐어요.',
      ),
    });
    renderRoute('/me/regions');

    fireEvent.click(await screen.findByRole('button', { name: '마포구 망원동 빼기' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('마포구 망원동을 뺄까요?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '빼기' }));

    expect(await screen.findByText('내 동네에서 뺐어요')).toBeInTheDocument();
    expect(server.calls('DELETE /users/me/local-regions/:id')[0].path).toBe(
      '/users/me/local-regions/2',
    );
    expect(screen.queryByText('망원동')).not.toBeInTheDocument();
    expect(screen.getByText(/2027.1.1부터 다시 바꿀 수 있어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ 내 동네 추가' })).toBeDisabled();
  });

  it('이번 시즌에 이미 바꿨으면 빼기·추가를 막는다', async () => {
    mockApi({ 'GET /users/me/local-regions': ok(regions(false)) });
    renderRoute('/me/regions');

    expect(await screen.findByRole('button', { name: '강서구 가양동 빼기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ 내 동네 추가' })).toBeDisabled();
  });

  it('동을 찾아 고르고 확인하면 내 동네에 추가한다', async () => {
    const server = mockApi({
      // 최대 2곳이라 1곳만 있을 때 추가할 수 있다
      'GET /users/me/local-regions': ok({ ...regions(), items: [me.localRegions[0]] }),
      'GET /regions/search': ok({
        keyword: '성수',
        items: [
          {
            regionId: 13,
            dongName: '성수동',
            sigunguId: 3,
            sigunguName: '성동구',
            fullName: '서울특별시 성동구 성수동',
            centerLat: 37.54,
            centerLng: 127.05,
          },
        ],
        totalCount: 1,
      }),
      'POST /users/me/local-regions': ok({}, '성동구 성수동을 내 동네에 추가했어요.'),
    });
    const { router } = renderRoute('/me/regions/add');

    fireEvent.change(screen.getByLabelText('동 이름 검색'), { target: { value: '성수' } });
    fireEvent.click(await screen.findByRole('button', { name: /성수동.*서울/ }));
    fireEvent.click(screen.getByRole('button', { name: '성동구 성수동 추가하기' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '추가' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/me/regions'));
    expect(server.calls('POST /users/me/local-regions')[0].body).toEqual({ regionId: 13 });
  });

  it('추가 화면으로 바로 들어와도 이번 시즌에 이미 바꿨으면 추가를 막는다', async () => {
    mockApi({
      'GET /users/me/local-regions': ok(regions(false)),
      'GET /regions/search': ok({
        keyword: '성수',
        items: [
          {
            regionId: 13,
            dongName: '성수동',
            sigunguId: 3,
            sigunguName: '성동구',
            fullName: '서울특별시 성동구 성수동',
            centerLat: 37.54,
            centerLng: 127.05,
          },
        ],
        totalCount: 1,
      }),
    });
    renderRoute('/me/regions/add');

    expect(await screen.findByText(/2027.1.1부터 다시 바꿀 수 있어요/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('동 이름 검색'), { target: { value: '성수' } });
    fireEvent.click(await screen.findByRole('button', { name: /성수동.*서울/ }));
    expect(screen.getByRole('button', { name: '성동구 성수동 추가하기' })).toBeDisabled();
  });
});

describe('설정 (AUTH-11)', () => {
  it('로그아웃을 확인하면 서버 쿠키를 지우고 로그인 화면으로 간다', async () => {
    const server = mockApi({
      'GET /users/me': ok(me),
      'POST /auth/logout': ok(null),
    });
    const { router } = renderRoute('/me/settings');

    expect(await screen.findByText('카카오')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /로그아웃/ }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '로그아웃' }),
    );

    await waitFor(() => expect(getSession().status).toBe('guest'));
    expect(server.calls('POST /auth/logout')).toHaveLength(1);
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/(login|onboarding)$/));
  });

  it('서버에서 로그아웃하지 못하면 로그인 상태를 유지하고 알려 준다', async () => {
    mockApi({
      'GET /users/me': ok(me),
      'POST /auth/logout': fail(500, 'INTERNAL_SERVER_ERROR', '잠시 후 다시 시도해 주세요.'),
    });
    renderRoute('/me/settings');

    expect(await screen.findByText('카카오')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /로그아웃/ }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '로그아웃' }),
    );

    expect(await screen.findByText(/로그아웃하지 못했어요/)).toBeInTheDocument();
    expect(getSession().status).toBe('authed');
  });

  it('위치 권한 조회가 끝나기 전에 화면을 떠나면 권한 변경을 지켜보지 않는다', async () => {
    let answer!: (status: PermissionStatus) => void;
    const query = vi.fn(() => new Promise<PermissionStatus>((resolve) => (answer = resolve)));
    Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true });
    const status = { state: 'granted', addEventListener: vi.fn(), removeEventListener: vi.fn() };
    mockApi({ 'GET /users/me': ok(me) });

    const view = renderRoute('/me/settings');
    await waitFor(() => expect(query).toHaveBeenCalled());
    view.unmount();
    answer(status as unknown as PermissionStatus);
    await new Promise((r) => setTimeout(r, 10));

    expect(status.addEventListener).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true });
  });

  it('위치 권한이 켜져 있다고 보여도 누르면 다시 확인한다', async () => {
    const query = vi.fn(async () => ({
      state: 'granted',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true });
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_ok: PositionCallback, err: PositionErrorCallback) =>
          err({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
      },
      configurable: true,
    });
    mockApi({ 'GET /users/me': ok(me) });
    renderRoute('/me/settings');

    fireEvent.click(await screen.findByRole('button', { name: /위치 권한.*허용됨/ }));

    expect(await screen.findByText(/위치를 ‘허용’으로 바꿔 주세요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /위치 권한.*꺼짐/ })).toBeInTheDocument();
    Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
  });

  it('연결된 계정은 카카오이고 비밀번호 변경 메뉴는 없다', async () => {
    mockApi({ 'GET /users/me': ok(me) });
    renderRoute('/me/settings');

    expect(await screen.findByText('카카오')).toBeInTheDocument();
    expect(screen.queryByText('비밀번호 변경')).not.toBeInTheDocument();
  });
});
