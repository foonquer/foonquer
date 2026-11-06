import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getAccessToken } from '../lib/session';
import { fail, mockApi, ok } from './http';
import { renderRoute } from './render';

const guest = { status: 'guest' } as const;

const tokenResult = (nextAction: string) => ({
  accessToken: 'new-token',
  tokenType: 'Bearer',
  expiresIn: 3600,
  nextAction,
  user: { id: 1, email: 'a@b.com', nickname: null, profileImageUrl: null, status: 'P' },
});

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('이메일 로그인 (S-03-1)', () => {
  it('로그인하면 토큰을 메모리에 두고 다음 단계 화면으로 간다', async () => {
    const server = mockApi({ 'POST /auth/login': ok(tokenResult('HOME')) });
    const { router } = renderRoute('/login/email', { session: guest });

    type('이메일', ' junhyung@email.com ');
    type('비밀번호', 'password1');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(server.calls('POST /auth/login')[0].body).toEqual({
      email: 'junhyung@email.com',
      password: 'password1',
    });
    expect(getAccessToken()).toBe('new-token');
  });

  it('비밀번호가 틀리면 틀린 횟수와 잠금 안내를 보여 준다', async () => {
    mockApi({
      'POST /auth/login': fail(
        401,
        'LOGIN_INVALID_CREDENTIALS',
        '이메일 또는 비밀번호가 맞지 않아요.',
        {
          failCount: 2,
          maxFailCount: 5,
        },
      ),
    });
    renderRoute('/login/email', { session: guest });

    type('이메일', 'junhyung@email.com');
    type('비밀번호', 'wrong1234');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByText('이메일 또는 비밀번호가 맞지 않아요 (2/5)')).toBeInTheDocument();
    expect(screen.getByText('5번 틀리면 10분 동안 로그인할 수 없어요')).toBeInTheDocument();
  });
});

describe('이메일 회원가입 (S-03-2)', () => {
  it('중복 확인 → 인증 코드 → 비밀번호 → 필수 약관 동의 후 가입하고 프로필 설정으로 간다', async () => {
    const server = mockApi({
      'GET /auth/email/availability': ok(
        { email: 'new@email.com', available: true, reason: null, provider: null },
        '사용할 수 있는 이메일이에요.',
      ),
      'POST /auth/email/verification-code': ok({
        email: 'new@email.com',
        expiresIn: 300,
        resendAvailableIn: 60,
      }),
      'POST /auth/email/verification-code/verify': ok({
        emailVerificationToken: 'verified',
        expiresIn: 1800,
      }),
      'POST /auth/signup': ok(tokenResult('PROFILE_REQUIRED')),
    });
    const { router } = renderRoute('/signup/email', { session: guest });

    type('이메일', 'New@Email.com');
    fireEvent.click(
      await screen.findByRole('button', { name: '인증 코드 받기' }, { timeout: 2000 }),
    );
    expect(server.calls('GET /auth/email/availability')[0].query.get('email')).toBe(
      'new@email.com',
    );

    await screen.findByLabelText('인증 코드');
    expect(screen.getByText('5:00')).toBeInTheDocument(); // 인증 코드 유효 시간
    type('인증 코드', '12a3456');
    await screen.findByText(/이메일 인증이 끝났어요/);
    expect(server.calls('POST /auth/email/verification-code/verify')[0].body).toEqual({
      email: 'new@email.com',
      code: '123456',
    });

    type('비밀번호', 'password1');
    type('비밀번호 확인', 'password1');
    const next = screen.getByRole('button', { name: '다음' });
    expect(next).toBeDisabled(); // 약관 동의 전
    fireEvent.click(screen.getByLabelText('[필수] 서비스 이용약관'));
    fireEvent.click(screen.getByLabelText('[필수] 개인정보 수집·이용'));
    fireEvent.click(screen.getByLabelText('[필수] 위치기반 서비스 이용약관'));
    expect(next).toBeEnabled();
    fireEvent.click(next);

    await waitFor(() => expect(router.state.location.pathname).toBe('/profile/setup'));
    expect(server.calls('POST /auth/signup')[0].body).toEqual({
      email: 'new@email.com',
      password: 'password1',
      passwordConfirm: 'password1',
      emailVerificationToken: 'verified',
      consents: { terms: true, privacy: true, location: true, marketing: false },
    });
  });

  it('인증 확인 중에 이메일을 바꾸면 늦게 온 인증 결과를 쓰지 않는다', async () => {
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    const server = mockApi({
      'GET /auth/email/availability': ok(
        { email: 'new@email.com', available: true, reason: null, provider: null },
        '사용할 수 있는 이메일이에요.',
      ),
      'POST /auth/email/verification-code': ok({
        email: 'new@email.com',
        expiresIn: 300,
        resendAvailableIn: 60,
      }),
      'POST /auth/email/verification-code/verify': async () => {
        await answered;
        return ok({ emailVerificationToken: 'verified', expiresIn: 1800 });
      },
    });
    renderRoute('/signup/email', { session: guest });

    type('이메일', 'new@email.com');
    fireEvent.click(
      await screen.findByRole('button', { name: '인증 코드 받기' }, { timeout: 2000 }),
    );
    await screen.findByLabelText('인증 코드');
    // 보냈다는 문구만 읽어 주고, 매초 바뀌는 다시 보내기 버튼은 그 밖에 둔다
    expect(screen.getByText('✓ 인증 코드를 보냈어요')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: /코드 다시 보내기/ })).not.toHaveAttribute('role');
    type('인증 코드', '123456');
    await waitFor(() =>
      expect(server.calls('POST /auth/email/verification-code/verify')).toHaveLength(1),
    );
    type('이메일', 'other@email.com');
    await act(async () => answer());

    // 바뀐 이메일은 아직 인증 전이라 나머지를 다 채워도 가입할 수 없다
    type('비밀번호', 'password1');
    type('비밀번호 확인', 'password1');
    fireEvent.click(screen.getByLabelText('[필수] 서비스 이용약관'));
    fireEvent.click(screen.getByLabelText('[필수] 개인정보 수집·이용'));
    fireEvent.click(screen.getByLabelText('[필수] 위치기반 서비스 이용약관'));
    await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).toBeDisabled());
  });

  it('이미 가입한 이메일이면 서버 문구를 보여 주고 인증 코드를 받을 수 없다', async () => {
    mockApi({
      'GET /auth/email/availability': ok(
        { email: 'a@b.com', available: false, reason: 'EMAIL_ALREADY_EXISTS', provider: null },
        '이미 가입한 이메일이에요.',
      ),
    });
    renderRoute('/signup/email', { session: guest });

    type('이메일', 'a@b.com');

    expect(
      await screen.findByText('이미 가입한 이메일이에요', {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '인증 코드 받기' })).not.toBeInTheDocument();
  });
});

describe('소셜 로그인 콜백', () => {
  it('처음 가입한 소셜 회원은 약관 동의 화면으로 간다', async () => {
    const server = mockApi({
      'POST /auth/oauth/exchange': ok({ ...tokenResult('TERMS_REQUIRED'), isNewUser: true }),
      'GET /users/me': ok({ loginMethods: ['KAKAO'] }),
    });
    const { router } = renderRoute('/oauth/callback?code=one-time', { session: guest });

    await waitFor(() => expect(router.state.location.pathname).toBe('/signup/terms'));
    expect(server.calls('POST /auth/oauth/exchange')).toHaveLength(1);
    expect(server.calls('POST /auth/oauth/exchange')[0].body).toEqual({
      oauthResultCode: 'one-time',
    });
  });

  it('같은 이메일 계정이 있으면 연동 확인 화면에서 연결한다 (S-03-8)', async () => {
    const server = mockApi({
      'POST /auth/oauth/exchange': ok({
        nextAction: 'ACCOUNT_LINK_REQUIRED',
        accountLinkToken: 'link-token',
        accountLinkTokenExpiresIn: 300,
        provider: 'K',
        maskedEmail: 'ju****@email.com',
        existingLoginMethods: ['EMAIL'],
      }),
      'POST /auth/oauth/link': ok({ ...tokenResult('HOME'), linkedProvider: 'K' }),
    });
    const { router } = renderRoute('/oauth/callback?code=x', { session: guest });

    fireEvent.click(await screen.findByRole('button', { name: '카카오 계정 연결하기' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(server.calls('POST /auth/oauth/link')[0].body).toEqual({
      accountLinkToken: 'link-token',
    });
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
      await screen.findByText('소셜 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument();
  });
});

describe('비밀번호 찾기·재설정 (S-03-3 ~ S-03-9)', () => {
  it('재설정 메일을 보내면 보낸 주소와 다시 보내기 대기 시간을 보여 준다', async () => {
    const server = mockApi({
      'POST /auth/password/reset-email': ok({
        email: 'junhyung@email.com',
        expiresIn: 1800,
        resendAvailableIn: 60,
      }),
    });
    renderRoute('/password/forgot', { session: guest });

    type('이메일', 'junhyung@email.com');
    fireEvent.click(screen.getByRole('button', { name: '재설정 메일 보내기' }));

    expect(await screen.findByText('메일을 보냈어요')).toBeInTheDocument();
    expect(screen.getByText(/junhyung@email.com으로 보낸 링크를/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '메일 다시 보내기 (60초 후)' })).toBeDisabled();
    expect(server.calls('POST /auth/password/reset-email')[0].body).toEqual({
      email: 'junhyung@email.com',
    });
  });

  it('새 비밀번호를 정하면 완료 화면을 보여 준다', async () => {
    const server = mockApi({
      'GET /auth/password/reset-token': ok({ maskedEmail: 'ju****@email.com', expiresAt: 'x' }),
      'POST /auth/password/reset': ok(null),
    });
    renderRoute('/password/reset?token=abc', { session: guest });

    await screen.findByLabelText('새 비밀번호');
    type('새 비밀번호', 'newpass123');
    type('새 비밀번호 확인', 'newpass123');
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    expect(await screen.findByText('비밀번호를 바꿨어요')).toBeInTheDocument();
    expect(server.calls('POST /auth/password/reset')[0].body).toEqual({
      token: 'abc',
      newPassword: 'newpass123',
      newPasswordConfirm: 'newpass123',
    });
  });

  it('로그인한 상태에서도 비밀번호 찾기 화면을 열 수 있다 (만료된 링크에서 다시 받기)', async () => {
    mockApi({});
    const { router } = renderRoute('/password/forgot');

    expect(await screen.findByRole('button', { name: '재설정 메일 보내기' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/password/forgot');
  });

  it('만료된 링크면 링크 만료 화면을 보여 준다', async () => {
    mockApi({
      'GET /auth/password/reset-token': fail(
        400,
        'PASSWORD_RESET_TOKEN_EXPIRED',
        '링크가 만료되었어요.',
      ),
    });
    renderRoute('/password/reset?token=old', { session: guest });

    expect(await screen.findByText('링크가 만료되었어요')).toBeInTheDocument();
  });
});

describe('약관 동의 (S-03-7, 소셜 가입)', () => {
  it('필수 약관에 동의하면 저장하고 프로필 설정으로 간다', async () => {
    const server = mockApi({
      'GET /users/me': ok({ loginMethods: ['GOOGLE'] }),
      'POST /users/me/consents': ok({ nextAction: 'PROFILE_REQUIRED' }),
    });
    const { router } = renderRoute('/signup/terms', {
      session: { status: 'authed', nextAction: 'TERMS_REQUIRED' },
    });

    expect(await screen.findByText(/구글로 가입했어요/)).toBeInTheDocument();
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
