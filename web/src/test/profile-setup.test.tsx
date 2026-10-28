import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { fail, mockApi, ok } from './http';
import { renderRoute } from './render';

const session = { status: 'authed', nextAction: 'PROFILE_REQUIRED' } as const;

const GAYANG = {
  regionId: 11,
  dongName: '가양동',
  sigunguId: 2,
  sigunguName: '강서구',
  fullName: '서울특별시 강서구 가양동',
  centerLat: 37.56,
  centerLng: 126.85,
};
const MANGWON = {
  ...GAYANG,
  regionId: 12,
  dongName: '망원동',
  sigunguName: '마포구',
  fullName: '서울특별시 마포구 망원동',
};
const SEONGSU = {
  ...GAYANG,
  regionId: 13,
  dongName: '성수동',
  sigunguName: '성동구',
  fullName: '서울특별시 성동구 성수동',
};
const YEOKSAM = {
  ...GAYANG,
  regionId: 14,
  dongName: '역삼동',
  sigunguName: '강남구',
  fullName: '서울특별시 강남구 역삼동',
};
const DONGS = [GAYANG, MANGWON, SEONGSU, YEOKSAM];

const welcome = {
  seasonNo: 3,
  tierTitle: '강서구 초보 탐방러',
  mukkaebi: { level: 1, stage: 'E' },
  firstGoal: { sigunguName: '강서구', current: 0, target: 5, nextTierName: '단골' },
};

function profileApi(extra = {}) {
  return mockApi({
    'GET /users/nickname/availability': ok(
      { nickname: '아기깨비', available: true, reason: null },
      '사용할 수 있는 닉네임이에요.',
    ),
    'GET /regions/search': ({ query }) => {
      const keyword = query.get('keyword') ?? '';
      const items = DONGS.filter((d) => keyword.split(' ').every((w) => d.fullName.includes(w)));
      return ok({ keyword, items, totalCount: items.length });
    },
    'POST /users/me/profile': ok({ nextAction: 'HOME', user: {}, localRegions: [], welcome }),
    ...extra,
  });
}

/** S-04 닉네임 → S-05 성별·나이대까지 채우고 S-06으로 */
async function goToRegionStep() {
  fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '아기깨비' } });
  await screen.findByText(/사용할 수 있는/, {}, { timeout: 2000 });
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  fireEvent.click(await screen.findByRole('radio', { name: '남성' }));
  fireEvent.click(screen.getByRole('radio', { name: '20대' }));
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  await screen.findByText('3/3 · 내 동네');
}

async function searchAndPick(keyword: string, dongName: string) {
  fireEvent.change(screen.getByLabelText('동 이름 검색'), { target: { value: keyword } });
  // 검색 결과 줄 (이름 + "서울 ○○구"). 빈 화면의 추천 칩과 구별한다
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`${dongName}.*서울`) }));
}

afterEach(() => {
  Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
});

describe('프로필 설정 (S-04 ~ S-07)', () => {
  it('닉네임·성별·나이대·내 동네를 고르면 저장하고 가입 완료 화면을 거쳐 홈으로 간다', async () => {
    const server = profileApi();
    const { router } = renderRoute('/profile/setup', { session });

    await goToRegionStep();
    expect(router.state.location.search).toBe('?step=region');
    await searchAndPick('가양', '가양동');
    expect(screen.getByRole('button', { name: '강서구 가양동 빼기' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1곳으로 시작하기' }));

    expect(await screen.findByText('강서구 초보 탐방러')).toBeInTheDocument();
    expect(screen.getByText('SEASON 3 · NEW EXPLORER')).toBeInTheDocument();
    expect(screen.getByText('남성 · 20대 · 강서구 가양동')).toBeInTheDocument();
    expect(screen.getByText(/단골이 돼요/)).toBeInTheDocument();
    expect(server.calls('POST /users/me/profile')[0].body).toEqual({
      nickname: '아기깨비',
      gender: 'M',
      ageGroup: 20,
      localRegionIds: [11],
    });

    fireEvent.click(screen.getByRole('button', { name: '첫 맛집 찾으러 가기' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('가입 완료 화면에서 다른 화면에 갔다 와도 완료 화면을 다시 보여 준다', async () => {
    profileApi();
    const { router } = renderRoute('/profile/setup', { session });
    await goToRegionStep();
    await searchAndPick('가양', '가양동');
    fireEvent.click(screen.getByRole('button', { name: '1곳으로 시작하기' }));
    expect(await screen.findByText('강서구 초보 탐방러')).toBeInTheDocument();

    // 약관 화면 주소로 갔다가 라우트 가드가 프로필 설정으로 돌려보낸다 (화면을 새로 그림)
    await act(() => router.navigate('/signup/terms'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/profile/setup'));
    expect(await screen.findByText('강서구 초보 탐방러')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '첫 맛집 찾으러 가기' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('이미 프로필 설정을 마친 회원이면 홈으로 보낸다', async () => {
    profileApi({
      'POST /users/me/profile': fail(409, 'PROFILE_ALREADY_COMPLETED', '이미 프로필을 설정했어요.'),
    });
    const { router } = renderRoute('/profile/setup', { session });
    await goToRegionStep();
    await searchAndPick('가양', '가양동');
    fireEvent.click(screen.getByRole('button', { name: '1곳으로 시작하기' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('이미 쓰는 닉네임이면 안내하고 다음으로 갈 수 없다', async () => {
    profileApi({
      'GET /users/nickname/availability': ok({
        nickname: '아기깨비',
        available: false,
        reason: 'DUPLICATE',
      }),
    });
    renderRoute('/profile/setup', { session });

    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '아기깨비' } });

    expect(
      await screen.findByText(
        '이미 누군가 쓰고 있어요. 다른 이름은 어때요?',
        {},
        { timeout: 2000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });

  it('규칙에 맞지 않는 닉네임은 서버에 묻지 않는다', async () => {
    const server = profileApi();
    renderRoute('/profile/setup', { session });

    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '깨비!' } });

    expect(
      await screen.findByText('닉네임은 한글·영문·숫자만 쓸 수 있어요.', {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(server.calls('GET /users/nickname/availability')).toHaveLength(0);
  });

  it('성별·나이대는 방향키로 고르고, 고른 칸만 Tab으로 들어온다', async () => {
    profileApi();
    renderRoute('/profile/setup', { session });
    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '아기깨비' } });
    await screen.findByText(/사용할 수 있는/, {}, { timeout: 2000 });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    const female = await screen.findByRole('radio', { name: '여성' });
    expect(female).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: '남성' })).toHaveAttribute('tabindex', '-1');

    female.focus();
    fireEvent.keyDown(female, { key: 'ArrowRight' });
    const male = screen.getByRole('radio', { name: '남성' });
    expect(male).toHaveAttribute('aria-checked', 'true');
    expect(male).toHaveAttribute('tabindex', '0');
    expect(male).toHaveFocus();
  });

  it('동네를 찾는 동안에는 결과 수 대신 불러오는 표시를 보여 준다', async () => {
    profileApi();
    renderRoute('/profile/setup', { session });
    await goToRegionStep();

    fireEvent.change(screen.getByLabelText('동 이름 검색'), { target: { value: '가양' } });
    expect(await screen.findByRole('status', { name: '동네를 찾는 중' })).toBeInTheDocument();
    expect(screen.getByText(/'가양' 검색 결과/).querySelector('span')).toBeNull();
    await screen.findByRole('button', { name: /가양동.*서울/ });
    expect(screen.queryByRole('status', { name: '동네를 찾는 중' })).not.toBeInTheDocument();
  });

  it('내 동네는 3곳까지 고를 수 있고, 고른 동네를 다시 누르면 빠진다', async () => {
    profileApi();
    renderRoute('/profile/setup', { session });
    await goToRegionStep();

    await searchAndPick('가양', '가양동');
    await searchAndPick('망원', '망원동');
    await searchAndPick('성수', '성수동');
    await searchAndPick('역삼', '역삼동');

    expect(await screen.findByText('내 동네는 최대 3곳까지 고를 수 있어요.')).toBeInTheDocument();
    expect(screen.getByText('고른 동네 3 / 3')).toBeInTheDocument();

    await searchAndPick('망원', '망원동');
    expect(screen.getByText('고른 동네 2 / 3')).toBeInTheDocument();
  });

  it('위치 권한이 꺼져 있으면 안내 시트를 띄우고, 구·동 목록에서 직접 고를 수 있다', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: unknown, error: (e: object) => void) =>
          error({ code: 1, PERMISSION_DENIED: 1 }),
      },
    });
    const server = profileApi();
    renderRoute('/profile/setup', { session });
    await goToRegionStep();

    fireEvent.click(screen.getByRole('button', { name: '현재 위치로 찾기' }));
    expect(await screen.findByText('위치 권한이 꺼져 있어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '직접 고를게요' }));

    fireEvent.click(screen.getByRole('button', { name: '강서구' }));
    fireEvent.click(screen.getByRole('button', { name: '가양동' }));

    expect(await screen.findByRole('button', { name: '강서구 가양동 빼기' })).toBeInTheDocument();
    expect(server.calls('GET /regions/search')[0].query.get('keyword')).toBe('강서구 가양동');
  });

  it('현재 위치로 찾으면 그 동네를 고른다', async () => {
    const getCurrentPosition = vi.fn((success: (p: object) => void) =>
      success({ coords: { latitude: 37.56, longitude: 126.85 } }),
    );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });
    const server = profileApi({ 'GET /regions/current': ok(GAYANG) });
    renderRoute('/profile/setup', { session });
    await goToRegionStep();

    fireEvent.click(screen.getByRole('button', { name: '현재 위치로 찾기' }));

    expect(await screen.findByRole('button', { name: '강서구 가양동 빼기' })).toBeInTheDocument();
    expect(server.calls('GET /regions/current')[0].query.get('lat')).toBe('37.56');
  });
});
