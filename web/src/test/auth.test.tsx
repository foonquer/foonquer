import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getAccessToken } from '../lib/session';
import { mockApi, ok } from './http';
import { renderRoute } from './render';

const guest = { status: 'guest' } as const;

const tokenResult = (nextAction: string) => ({
  accessToken: 'new-token',
  tokenType: 'Bearer',
  expiresIn: 3600,
  nextAction,
  user: { id: 1, nickname: null, profileImageUrl: null, status: 'P' },
});

describe('로그인 (S-03)', () => {
  it('로그인 방법은 카카오 하나만 보여 준다', async () => {
    mockApi({});
    renderRoute('/login', { session: guest });

    expect(await screen.findByRole('button', { name: '카카오로 시작하기' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('카카오 로그인 콜백', () => {
  it('처음 가입한 회원은 약관 동의 화면으로 간다', async () => {
    const server = mockApi({
      'POST /auth/oauth/exchange': ok({ ...tokenResult('TERMS_REQUIRED'), isNewUser: true }),
    });
    const { router } = renderRoute('/oauth/callback?code=one-time', { session: guest });

    await waitFor(() => expect(router.state.location.pathname).toBe('/signup/terms'));
    expect(server.calls('POST /auth/oauth/exchange')).toHaveLength(1);
    expect(server.calls('POST /auth/oauth/exchange')[0].body).toEqual({
      oauthResultCode: 'one-time',
    });
    expect(getAccessToken()).toBe('new-token');
  });

  it('이미 가입한 회원은 홈으로 간다', async () => {
    mockApi({ 'POST /auth/oauth/exchange': ok({ ...tokenResult('HOME'), isNewUser: false }) });
    const { router } = renderRoute('/oauth/callback?code=x', { session: guest });

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('로그인을 취소하고 돌아오면 로그인 화면에서 안내한다', async () => {
    mockApi({});
    const { router } = renderRoute('/oauth/callback?error=OAUTH_CANCELLED', { session: guest });

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText('로그인을 취소했어요.')).toBeInTheDocument();
  });

  it('모르는 오류 코드면 기본 실패 문구를 보여 준다', async () => {
    mockApi({});
    const { router } = renderRoute('/oauth/callback?error=toString', { session: guest });

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(
      await screen.findByText('카카오 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument();
  });
});

describe('약관 동의 (S-03-7)', () => {
  it('필수 약관에 동의하면 저장하고 프로필 설정으로 간다', async () => {
    const server = mockApi({
      'POST /users/me/consents': ok({ nextAction: 'PROFILE_REQUIRED' }),
    });
    const { router } = renderRoute('/signup/terms', {
      session: { status: 'authed', nextAction: 'TERMS_REQUIRED' },
    });

    expect(await screen.findByText(/카카오로 가입했어요/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('모두 동의할게요'));
    fireEvent.click(screen.getByRole('button', { name: '동의하고 시작하기' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/profile/setup'));
    expect(server.calls('POST /users/me/consents')[0].body).toEqual({
      terms: true,
      privacy: true,
      location: true,
      marketing: true,
    });
  });
});
