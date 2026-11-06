import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../lib/api';
import { getAccessToken, getSession, resetSessionForTest } from '../lib/session';
import { fail, mockApi, ok } from './http';

beforeEach(() => {
  resetSessionForTest({ status: 'authed', nextAction: 'HOME' }, 'old-token');
});

describe('API 호출', () => {
  it('로그인 상태면 Bearer 토큰과 쿠키(credentials)를 같이 보내고 data만 돌려준다', async () => {
    const server = mockApi({ 'GET /users/me': ok({ id: 1 }) });

    await expect(api.get('/users/me')).resolves.toEqual({ id: 1 });

    const [call] = server.calls('GET /users/me');
    expect(call.headers.get('Authorization')).toBe('Bearer old-token');
    expect(server.fetch.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
  });

  it('query의 빈 값은 빼고 보낸다', async () => {
    const server = mockApi({ 'GET /restaurants/search': ok([]) });

    await api.get('/restaurants/search', { keyword: '칼국수', categoryId: undefined, page: 1 });

    expect(server.calls('GET /restaurants/search')[0].query.toString()).toBe(
      'keyword=%EC%B9%BC%EA%B5%AD%EC%88%98&page=1',
    );
  });

  it('실패하면 서버의 code·message·data를 담은 ApiError를 던진다', async () => {
    mockApi({
      'POST /auth/login': fail(
        401,
        'LOGIN_INVALID_CREDENTIALS',
        '이메일 또는 비밀번호가 맞지 않아요.',
        {
          failCount: 1,
          maxFailCount: 5,
        },
      ),
    });

    const err = await api.post('/auth/login', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 401,
      code: 'LOGIN_INVALID_CREDENTIALS',
      message: '이메일 또는 비밀번호가 맞지 않아요.',
      data: { failCount: 1, maxFailCount: 5 },
    });
  });

  it('call()은 message도 돌려준다', async () => {
    mockApi({
      'POST /users/me/local-regions': ok({ items: [] }, '마포구 망원동을 내 동네에 추가했어요.'),
    });

    const result = await api.call('POST', '/users/me/local-regions', { body: { regionId: 1 } });
    expect(result.message).toBe('마포구 망원동을 내 동네에 추가했어요.');
  });

  it('서버에 닿지 않으면 NETWORK 에러', async () => {
    mockApi({});
    globalThis.fetch = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;

    await expect(api.get('/users/me')).rejects.toMatchObject({ code: 'NETWORK' });
  });
});

describe('accessToken 만료 (TOKEN_EXPIRED)', () => {
  it('재발급(AUTH-10)한 뒤 새 토큰으로 한 번 더 보낸다', async () => {
    const server = mockApi({
      'GET /users/me': ({ headers }) =>
        headers.get('Authorization') === 'Bearer new-token'
          ? ok({ id: 1 })
          : fail(401, 'TOKEN_EXPIRED'),
      'POST /auth/refresh': ok({ accessToken: 'new-token', nextAction: 'HOME' }),
    });

    await expect(api.get('/users/me')).resolves.toEqual({ id: 1 });
    expect(server.calls('GET /users/me')).toHaveLength(2);
    expect(getAccessToken()).toBe('new-token');
  });

  it('여러 요청이 동시에 만료돼도 재발급은 한 번만 한다', async () => {
    const server = mockApi({
      'GET /a': ({ headers }) =>
        headers.get('Authorization') === 'Bearer new-token' ? ok('a') : fail(401, 'TOKEN_EXPIRED'),
      'GET /b': ({ headers }) =>
        headers.get('Authorization') === 'Bearer new-token' ? ok('b') : fail(401, 'TOKEN_EXPIRED'),
      'POST /auth/refresh': ok({ accessToken: 'new-token', nextAction: 'HOME' }),
    });

    await expect(Promise.all([api.get('/a'), api.get('/b')])).resolves.toEqual(['a', 'b']);
    expect(server.calls('POST /auth/refresh')).toHaveLength(1);
  });

  it('재발급도 실패하면 로그아웃 상태가 되고 원래 에러를 던진다', async () => {
    mockApi({
      'GET /users/me': fail(401, 'TOKEN_EXPIRED', '로그인이 만료되었어요.'),
      'POST /auth/refresh': fail(401, 'REFRESH_TOKEN_EXPIRED'),
    });

    await expect(api.get('/users/me')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(getSession()).toEqual({ status: 'guest' });
    expect(getAccessToken()).toBeNull();
  });
});

describe('재발급이 일시적으로 실패할 때', () => {
  it('서버가 503이면 로그인 상태를 그대로 두고 원래 에러를 던진다', async () => {
    mockApi({
      'GET /users/me': fail(401, 'TOKEN_EXPIRED', '로그인이 만료되었어요.'),
      'POST /auth/refresh': () => ({ status: 503, body: '<html>Service Unavailable</html>' }),
    });

    await expect(api.get('/users/me')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(getSession()).toEqual({ status: 'authed', nextAction: 'HOME' });
    expect(getAccessToken()).toBe('old-token');
  });

  it('서버에 닿지 않아도 로그인 상태를 그대로 둔다', async () => {
    mockApi({ 'GET /users/me': fail(401, 'TOKEN_EXPIRED') });
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('/auth/refresh')
        ? Promise.reject(new TypeError('Failed to fetch'))
        : realFetch(input, init),
    );

    await expect(api.get('/users/me')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(getSession()).toEqual({ status: 'authed', nextAction: 'HOME' });
  });
});

describe('회원 상태 에러', () => {
  it('TOKEN_INVALID면 로그아웃 상태가 된다', async () => {
    mockApi({ 'GET /users/me': fail(401, 'TOKEN_INVALID') });

    await expect(api.get('/users/me')).rejects.toBeInstanceOf(ApiError);
    expect(getSession()).toEqual({ status: 'guest' });
  });

  it('PROFILE_REQUIRED면 다음 단계를 프로필 설정으로 바꾼다 (라우트 가드가 그 화면으로 보낸다)', async () => {
    mockApi({ 'GET /map/restaurants': fail(403, 'PROFILE_REQUIRED') });

    await expect(api.get('/map/restaurants')).rejects.toBeInstanceOf(ApiError);
    expect(getSession()).toEqual({ status: 'authed', nextAction: 'PROFILE_REQUIRED' });
  });
});
