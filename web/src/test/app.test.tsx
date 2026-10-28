import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { onboarding } from '../lib/storage';
import { fail, mockApi, ok } from './http';
import { renderRoute } from './render';

describe('앱 시작 (로그인 복구)', () => {
  it('복구하는 동안 스플래시를 보여 주고, refreshToken이 있으면 홈으로 간다', async () => {
    const server = mockApi({ 'POST /auth/refresh': ok({ accessToken: 't', nextAction: 'HOME' }) });

    const { router } = renderRoute('/', { session: { status: 'loading' } });

    expect(screen.getByRole('status', { name: '먹장깨기를 여는 중' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: '하단 메뉴' })).toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe('/');
    expect(server.calls('POST /auth/refresh')).toHaveLength(1);
  });

  it('로그인하지 않았고 처음이면 온보딩으로 간다', async () => {
    mockApi({ 'POST /auth/refresh': fail(401, 'REFRESH_TOKEN_REQUIRED') });

    const { router } = renderRoute('/', { session: { status: 'loading' } });

    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding'));
  });

  it('온보딩을 본 적이 있으면 로그인으로 간다', async () => {
    onboarding.markSeen();
    mockApi({ 'POST /auth/refresh': fail(401, 'REFRESH_TOKEN_REQUIRED') });

    const { router } = renderRoute('/me', { session: { status: 'loading' } });

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.state).toMatchObject({ from: { pathname: '/me' } });
  });
});

describe('라우트 가드', () => {
  it('약관 동의 전 회원은 약관 동의 화면으로 보낸다', () => {
    mockApi({});
    const { router } = renderRoute('/', {
      session: { status: 'authed', nextAction: 'TERMS_REQUIRED' },
    });

    expect(router.state.location.pathname).toBe('/signup/terms');
    expect(screen.queryByText('페이지를 찾을 수 없어요')).not.toBeInTheDocument();
  });

  it('프로필 설정 전 회원은 프로필 설정 화면으로 보낸다', () => {
    mockApi({});
    const { router } = renderRoute('/me', {
      session: { status: 'authed', nextAction: 'PROFILE_REQUIRED' },
    });

    expect(router.state.location.pathname).toBe('/profile/setup');
    expect(screen.queryByText('페이지를 찾을 수 없어요')).not.toBeInTheDocument();
  });

  it('로그인한 회원이 로그인 화면에 오면 원래 가려던 화면(없으면 홈)으로 보낸다', () => {
    mockApi({});
    const { router } = renderRoute('/login', {
      state: { from: { pathname: '/me', search: '' } },
    });

    expect(router.state.location.pathname).toBe('/me');
  });
});

describe('하단 탭', () => {
  it('지금 탭을 진초록(aria-current)으로 표시한다', () => {
    mockApi({});
    renderRoute('/ranking');

    expect(screen.getByRole('link', { name: '랭킹/현황' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '홈' })).not.toHaveAttribute('aria-current');
  });
});

describe('없는 주소', () => {
  it('찾을 수 없음 화면', () => {
    mockApi({});
    renderRoute('/nope');

    expect(screen.getByText('페이지를 찾을 수 없어요')).toBeInTheDocument();
  });
});
