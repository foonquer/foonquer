import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { seedBaseData } from '../../prisma/seed-data';
import { prisma } from '../../src/lib/prisma';
import { createOAuthResultCode } from '../../src/modules/auth/social-login.service';
import { resetDb } from '../helpers/db';
import { agreeConsents, bearer, createMember } from '../helpers/fixtures';
import { refreshCookieOf } from '../helpers/http';

const app = createApp();

function cookiesOf(res: request.Response): string[] {
  const raw = res.headers['set-cookie'] as unknown;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 카카오 토큰·사용자 정보 응답을 흉내 낸다 */
function stubKakao(me: Record<string, unknown>) {
  const fetchMock = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://kauth.kakao.com/oauth/token')) {
      return Promise.resolve(jsonResponse({ access_token: 'kakao-access' }));
    }
    if (url.startsWith('https://kapi.kakao.com/v2/user/me')) {
      return Promise.resolve(jsonResponse(me));
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function exchange(code: string) {
  return request(app).post('/api/v1/auth/oauth/exchange').send({ oauthResultCode: code });
}

async function resultCode(
  profile: { providerId: string; email?: string | null; emailVerified?: boolean },
  slug: 'kakao' | 'google' = 'kakao',
) {
  return createOAuthResultCode(slug, {
    providerId: profile.providerId,
    email: profile.email ?? null,
    emailVerified: profile.emailVerified ?? false,
  });
}

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AUTH-06 GET /auth/oauth/{provider}', () => {
  it('카카오 인증 화면으로 302 이동하고 state를 httpOnly 쿠키에 넣는다', async () => {
    const res = await request(app).get('/api/v1/auth/oauth/kakao');

    expect(res.status).toBe(302);
    const location = new URL(String(res.headers.location));
    expect(location.origin + location.pathname).toBe('https://kauth.kakao.com/oauth/authorize');
    expect(location.searchParams.get('client_id')).toBe('test-kakao-rest-key');
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/v1/auth/oauth/kakao/callback',
    );
    expect(location.searchParams.get('response_type')).toBe('code');

    const stateCookie = cookiesOf(res).find((c) => c.startsWith('oauth_state='));
    expect(stateCookie).toContain('HttpOnly');
    expect(stateCookie).toContain('Path=/api/v1/auth/oauth');
    expect(stateCookie).toContain('Max-Age=600');
    expect(stateCookie?.split(';')[0]).toBe(`oauth_state=${location.searchParams.get('state')}`);
  });

  it('구글은 openid email 범위로 보낸다', async () => {
    const res = await request(app).get('/api/v1/auth/oauth/google');

    const location = new URL(String(res.headers.location));
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('scope')).toBe('openid email');
    expect(location.searchParams.get('client_id')).toBe('test-google-client-id');
  });

  it('지원하지 않는 방식이면 프론트 콜백으로 error=UNSUPPORTED_PROVIDER', async () => {
    const res = await request(app).get('/api/v1/auth/oauth/naver');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(
      'http://localhost:5173/oauth/callback?error=UNSUPPORTED_PROVIDER',
    );
  });
});

describe('AUTH-07 GET /auth/oauth/{provider}/callback', () => {
  function callback(query: Record<string, string>, state: string | null = 'state-1') {
    const req = request(app).get('/api/v1/auth/oauth/kakao/callback').query(query);
    return state ? req.set('Cookie', `oauth_state=${state}`) : req;
  }

  it('사용자 정보를 받아 1분짜리 일회용 코드만 붙여 프론트로 보낸다', async () => {
    const fetchMock = stubKakao({
      id: 4242,
      kakao_account: {
        email: 'JunHyung@Kakao.com',
        is_email_valid: true,
        is_email_verified: true,
      },
    });

    const res = await callback({ code: 'auth-code', state: 'state-1' });

    expect(res.status).toBe(302);
    const location = new URL(String(res.headers.location));
    expect(location.origin + location.pathname).toBe('http://localhost:5173/oauth/callback');
    const code = location.searchParams.get('code');
    expect(code).toBeTruthy();
    expect(cookiesOf(res).find((c) => c.startsWith('oauth_state='))).toContain('Max-Age=0');

    // 토큰 요청에 redirect_uri와 code를 보냈다.
    const tokenCall = fetchMock.mock.calls[0];
    const body = (tokenCall[1]?.body as URLSearchParams).toString();
    expect(body).toContain('code=auth-code');
    expect(body).toContain('client_id=test-kakao-rest-key');

    const row = await prisma.authTemporaryToken.findFirstOrThrow({
      where: { tokenType: 'OAUTH_RESULT' },
    });
    expect(row.payload).toEqual({
      provider: 'K',
      providerId: '4242',
      email: 'junhyung@kakao.com',
      emailVerified: true,
    });
    expect(row.expiresAt.getTime() - row.regDate.getTime()).toBe(60_000);
  });

  it('state가 없거나 다르면 OAUTH_STATE_MISMATCH', async () => {
    const missing = await callback({ code: 'c', state: 'state-1' }, null);
    expect(missing.headers.location).toBe(
      'http://localhost:5173/oauth/callback?error=OAUTH_STATE_MISMATCH',
    );

    const different = await callback({ code: 'c', state: 'other' });
    expect(different.headers.location).toContain('error=OAUTH_STATE_MISMATCH');
  });

  it('사용자가 취소하면 OAUTH_CANCELLED', async () => {
    const res = await callback({ error: 'access_denied', state: 'state-1' });
    expect(res.headers.location).toBe('http://localhost:5173/oauth/callback?error=OAUTH_CANCELLED');
  });

  it('취소(access_denied)가 아닌 다른 에러로 돌아오면 SOCIAL_LOGIN_FAILED', async () => {
    const res = await callback({ error: 'server_error', state: 'state-1' });
    expect(res.headers.location).toBe(
      'http://localhost:5173/oauth/callback?error=SOCIAL_LOGIN_FAILED',
    );
  });

  it('제공자 요청이 실패하면 SOCIAL_LOGIN_FAILED', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ error: 'invalid_grant' }, 400))),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await callback({ code: 'bad', state: 'state-1' });

    expect(res.headers.location).toBe(
      'http://localhost:5173/oauth/callback?error=SOCIAL_LOGIN_FAILED',
    );
    expect(await prisma.authTemporaryToken.count()).toBe(0);
  });
});

describe('AUTH-08 POST /auth/oauth/exchange', () => {
  it('② 처음 온 사람은 회원(P)과 소셜 계정을 만들고 TERMS_REQUIRED로 로그인시킨다', async () => {
    const code = await resultCode({
      providerId: 'k-new',
      email: 'new@kakao.com',
      emailVerified: true,
    });

    const res = await exchange(code);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('약관에 동의하고 프로필을 설정해 주세요.');
    expect(res.body.data).toMatchObject({
      nextAction: 'TERMS_REQUIRED',
      isNewUser: true,
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: { email: null, nickname: null, profileImageUrl: null, status: 'P' },
    });
    expect(refreshCookieOf(res)).toBeTruthy();

    const social = await prisma.socialAccount.findFirstOrThrow({ include: { user: true } });
    expect(social).toMatchObject({ provider: 'K', providerId: 'k-new', email: 'new@kakao.com' });
    expect(social.user).toMatchObject({ status: 'P', email: null, password: null });
    expect(social.user.lastLoginAt).not.toBeNull();
  });

  it('① 이미 연결된 소셜 계정이면 그 회원으로 로그인한다', async () => {
    const member = await createMember({ nickname: '아기깨비' });
    await prisma.socialAccount.create({
      data: { userId: member.id, provider: 'K', providerId: 'k-1', email: 'a@kakao.com' },
    });

    const res = await exchange(await resultCode({ providerId: 'k-1' }));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('로그인했어요.');
    expect(res.body.data).toMatchObject({
      nextAction: 'HOME',
      isNewUser: false,
      user: { id: Number(member.id), nickname: '아기깨비', status: 'A' },
    });
  });

  it('① 가입 절차가 남은 회원은 약관 동의 여부에 따라 TERMS_REQUIRED / PROFILE_REQUIRED', async () => {
    const member = await createMember({ status: 'P', nickname: null });
    await prisma.socialAccount.create({
      data: { userId: member.id, provider: 'G', providerId: 'g-1' },
    });

    const before = await exchange(await resultCode({ providerId: 'g-1' }, 'google'));
    expect(before.body.data.nextAction).toBe('TERMS_REQUIRED');

    await agreeConsents(member.id);
    const after = await exchange(await resultCode({ providerId: 'g-1' }, 'google'));
    expect(after.body.data.nextAction).toBe('PROFILE_REQUIRED');
  });

  it('① 이용 정지 회원은 403 MEMBER_SUSPENDED', async () => {
    const member = await createMember({ status: 'S' });
    await prisma.socialAccount.create({
      data: { userId: member.id, provider: 'K', providerId: 'k-1' },
    });

    const res = await exchange(await resultCode({ providerId: 'k-1' }));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MEMBER_SUSPENDED');
  });

  it('③ 검증된 같은 이메일의 계정이 있으면 로그인하지 않고 ACCOUNT_LINK_REQUIRED', async () => {
    const member = await createMember({ email: 'junhyung@email.com', password: 'hash' });
    await prisma.socialAccount.create({
      data: { userId: member.id, provider: 'G', providerId: 'g-1', email: 'other@gmail.com' },
    });

    const res = await exchange(
      await resultCode({ providerId: 'k-9', email: 'junhyung@email.com', emailVerified: true }),
    );

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('같은 이메일로 가입한 계정이 있어요. 계정을 연결할까요?');
    expect(res.body.data).toEqual({
      nextAction: 'ACCOUNT_LINK_REQUIRED',
      accountLinkToken: expect.any(String),
      accountLinkTokenExpiresIn: 300,
      provider: 'K',
      maskedEmail: 'jun***@email.com',
      existingLoginMethods: ['EMAIL', 'GOOGLE'],
    });
    expect(refreshCookieOf(res)).toBeNull();
    expect(await prisma.socialAccount.count({ where: { providerId: 'k-9' } })).toBe(0);
  });

  it('③ 다른 소셜 계정의 이메일과 같아도 연동을 묻는다', async () => {
    const member = await createMember();
    await prisma.socialAccount.create({
      data: { userId: member.id, provider: 'G', providerId: 'g-1', email: 'same@gmail.com' },
    });

    const res = await exchange(
      await resultCode({ providerId: 'k-1', email: 'same@gmail.com', emailVerified: true }),
    );

    expect(res.body.data.nextAction).toBe('ACCOUNT_LINK_REQUIRED');
    expect(res.body.data.existingLoginMethods).toEqual(['GOOGLE']);
  });

  it('④ 이메일이 미검증이면 같은 이메일 계정이 있어도 새로 가입시킨다', async () => {
    await createMember({ email: 'junhyung@email.com' });

    const res = await exchange(
      await resultCode({ providerId: 'k-1', email: 'junhyung@email.com', emailVerified: false }),
    );

    expect(res.body.data.nextAction).toBe('TERMS_REQUIRED');
    expect(res.body.data.isNewUser).toBe(true);
  });

  it('탈퇴한 회원에 남은 소셜 연결이면 지우고 새 회원으로 가입시킨다', async () => {
    const withdrawn = await createMember({ status: 'D', nickname: null });
    await prisma.socialAccount.create({
      data: { userId: withdrawn.id, provider: 'K', providerId: 'k-1' },
    });

    const res = await exchange(await resultCode({ providerId: 'k-1' }));

    expect(res.body.data).toMatchObject({ nextAction: 'TERMS_REQUIRED', isNewUser: true });
    const social = await prisma.socialAccount.findFirstOrThrow({ where: { providerId: 'k-1' } });
    expect(social.userId).not.toBe(withdrawn.id);
    expect(await prisma.socialAccount.count()).toBe(1);
  });

  it('미검증 이메일은 소셜 계정에 저장하지 않아서, 나중에 같은 이메일로 온 검증된 로그인의 연동 대상이 되지 않는다', async () => {
    await exchange(
      await resultCode({ providerId: 'k-1', email: 'same@email.com', emailVerified: false }),
    );
    const first = await prisma.socialAccount.findFirstOrThrow({ where: { providerId: 'k-1' } });
    expect(first.email).toBeNull();

    const res = await exchange(
      await resultCode(
        { providerId: 'g-1', email: 'same@email.com', emailVerified: true },
        'google',
      ),
    );

    expect(res.body.data).toMatchObject({ nextAction: 'TERMS_REQUIRED', isNewUser: true });
  });

  it('코드는 한 번만 쓸 수 있고, 만료되면 401, 없으면 400', async () => {
    const code = await resultCode({ providerId: 'k-1' });
    await exchange(code);

    const reused = await exchange(code);
    expect(reused.status).toBe(400);
    expect(reused.body.code).toBe('OAUTH_RESULT_CODE_INVALID');

    const unknown = await exchange('made-up');
    expect(unknown.body.code).toBe('OAUTH_RESULT_CODE_INVALID');

    const late = await resultCode({ providerId: 'k-2' });
    await prisma.authTemporaryToken.updateMany({
      where: { usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    const expired = await exchange(late);
    expect(expired.status).toBe(401);
    expect(expired.body.code).toBe('OAUTH_RESULT_CODE_EXPIRED');

    const missing = await request(app).post('/api/v1/auth/oauth/exchange').send({});
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('OAUTH_RESULT_CODE_REQUIRED');
  });
});

describe('AUTH-09 POST /auth/oauth/link', () => {
  async function linkToken(email = 'junhyung@email.com', providerId = 'k-9') {
    const res = await exchange(await resultCode({ providerId, email, emailVerified: true }));
    return res.body.data.accountLinkToken as string;
  }

  function link(token: string) {
    return request(app).post('/api/v1/auth/oauth/link').send({ accountLinkToken: token });
  }

  it('기존 회원에 소셜 계정을 붙이고 기존 회원으로 로그인한다', async () => {
    const member = await createMember({
      email: 'junhyung@email.com',
      password: 'hash',
      nickname: '아기깨비',
    });

    const res = await link(await linkToken());

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('카카오 계정을 연결했어요.');
    expect(res.body.data).toMatchObject({
      nextAction: 'HOME',
      tokenType: 'Bearer',
      linkedProvider: 'K',
      user: { id: Number(member.id), email: 'junhyung@email.com', nickname: '아기깨비' },
    });
    expect(refreshCookieOf(res)).toBeTruthy();
    const social = await prisma.socialAccount.findFirstOrThrow({ where: { providerId: 'k-9' } });
    expect(social.userId).toBe(member.id);

    // 이제 같은 카카오 계정으로 들어오면 바로 로그인된다.
    const again = await exchange(await resultCode({ providerId: 'k-9' }));
    expect(again.body.data.user.id).toBe(Number(member.id));
  });

  it('토큰은 한 번만 쓸 수 있고, 만료되면 ACCOUNT_LINK_TOKEN_EXPIRED', async () => {
    await createMember({ email: 'junhyung@email.com' });
    const token = await linkToken();
    await link(token);

    const reused = await link(token);
    expect(reused.status).toBe(401);
    expect(reused.body.code).toBe('ACCOUNT_LINK_TOKEN_INVALID');

    const other = await linkToken('junhyung@email.com', 'k-10');
    await prisma.authTemporaryToken.updateMany({
      where: { tokenType: 'ACCOUNT_LINK', usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    const expired = await link(other);
    expect(expired.status).toBe(401);
    expect(expired.body.code).toBe('ACCOUNT_LINK_TOKEN_EXPIRED');

    const missing = await request(app).post('/api/v1/auth/oauth/link').send({});
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('ACCOUNT_LINK_TOKEN_REQUIRED');
  });

  it('그사이 탈퇴했으면 404 MEMBER_NOT_FOUND, 정지면 403', async () => {
    const member = await createMember({ email: 'junhyung@email.com' });
    const token = await linkToken();
    await prisma.member.update({ where: { id: member.id }, data: { status: 'D' } });

    const gone = await link(token);
    expect(gone.status).toBe(404);
    expect(gone.body.code).toBe('MEMBER_NOT_FOUND');

    await prisma.member.update({ where: { id: member.id }, data: { status: 'S' } });
    const suspendedToken = await linkToken('junhyung@email.com', 'k-11');
    const suspended = await link(suspendedToken);
    expect(suspended.status).toBe(403);
    expect(suspended.body.code).toBe('MEMBER_SUSPENDED');
  });

  it('이미 다른 카카오 계정이 연결된 회원이면 409 PROVIDER_ALREADY_LINKED', async () => {
    const member = await createMember({ email: 'junhyung@email.com' });
    await prisma.socialAccount.create({
      data: { userId: member.id, provider: 'K', providerId: 'k-old' },
    });

    const res = await link(await linkToken('junhyung@email.com', 'k-new'));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PROVIDER_ALREADY_LINKED');
    expect(res.body.message).toBe('이 계정에는 이미 다른 카카오 계정이 연결되어 있어요.');
  });

  it('그사이 그 소셜 계정이 다른 회원에 연결됐으면 409 SOCIAL_ACCOUNT_ALREADY_USED', async () => {
    await createMember({ email: 'junhyung@email.com' });
    const token = await linkToken('junhyung@email.com', 'k-9');
    const someoneElse = await createMember();
    await prisma.socialAccount.create({
      data: { userId: someoneElse.id, provider: 'K', providerId: 'k-9' },
    });

    const res = await link(token);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SOCIAL_ACCOUNT_ALREADY_USED');
  });
});

describe('AUTH-15 POST /users/me/consents', () => {
  function agree(userId: bigint, body: Record<string, unknown>) {
    return request(app)
      .post('/api/v1/users/me/consents')
      .set('Authorization', bearer(userId))
      .send(body);
  }

  it('약관 동의 전 소셜 회원의 동의를 저장하고 PROFILE_REQUIRED로 보낸다', async () => {
    const member = await createMember({ status: 'P', nickname: null });

    const res = await agree(member.id, {
      terms: true,
      privacy: true,
      location: true,
      marketing: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('약관 동의를 저장했어요.');
    expect(res.body.data.nextAction).toBe('PROFILE_REQUIRED');
    expect(res.body.data.consents).toEqual([
      {
        type: 'TERMS',
        agreed: true,
        policyVersion: '2026-09-01',
        agreedAt: expect.stringMatching(/\+09:00$/),
      },
      { type: 'PRIVACY', agreed: true, policyVersion: '2026-09-01', agreedAt: expect.any(String) },
      { type: 'LOCATION', agreed: true, policyVersion: '2026-09-01', agreedAt: expect.any(String) },
      {
        type: 'MARKETING',
        agreed: true,
        policyVersion: '2026-09-01',
        agreedAt: expect.any(String),
      },
    ]);
    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.marketingAlarm).toBe(true);

    // 이제 프로필 설정 단계 API를 부를 수 있다 (TERMS_REQUIRED가 풀림).
    const me = await request(app)
      .post('/api/v1/users/me/consents')
      .set('Authorization', bearer(member.id))
      .send({ terms: true, privacy: true, location: true, marketing: true });
    expect(me.status).toBe(200);
  });

  it('다시 불러도 바뀐 항목만 새로 기록한다 (멱등)', async () => {
    const member = await createMember({ status: 'P', nickname: null });
    await agree(member.id, { terms: true, privacy: true, location: true, marketing: false });
    await agree(member.id, { terms: true, privacy: true, location: true, marketing: false });
    expect(await prisma.memberConsent.count({ where: { userId: member.id } })).toBe(4);

    const res = await agree(member.id, {
      terms: true,
      privacy: true,
      location: true,
      marketing: true,
    });
    expect(await prisma.memberConsent.count({ where: { userId: member.id } })).toBe(5);
    expect(res.body.data.consents[3]).toMatchObject({ type: 'MARKETING', agreed: true });
  });

  it('동의한 뒤 약관 버전이 바뀌었으면 다시 동의할 때 새 버전으로 기록한다', async () => {
    const member = await createMember({ status: 'P', nickname: null });
    await agree(member.id, { terms: true, privacy: true, location: true, marketing: false });
    await prisma.policyDocument.create({
      data: {
        type: 'TERMS',
        version: '2026-10-01',
        content: '새 버전',
        effectiveDate: new Date('2026-10-01'),
      },
    });

    const res = await agree(member.id, {
      terms: true,
      privacy: true,
      location: true,
      marketing: false,
    });

    expect(res.body.data.consents[0]).toMatchObject({ type: 'TERMS', policyVersion: '2026-10-01' });
    // TERMS 한 줄만 새로 쌓인다 (MARKETING은 동의하지 않아 그대로)
    expect(await prisma.memberConsent.count({ where: { userId: member.id } })).toBe(5);
  });

  it('동의 저장이 동시에 와도 최신 이력과 마케팅 알림 설정이 어긋나지 않는다', async () => {
    const member = await createMember({ status: 'P', nickname: null });

    await Promise.all([
      agree(member.id, { terms: true, privacy: true, location: true, marketing: true }),
      agree(member.id, { terms: true, privacy: true, location: true, marketing: false }),
    ]);

    const latest = await prisma.memberConsent.findFirstOrThrow({
      where: { userId: member.id, consentType: 'MARKETING' },
      orderBy: { id: 'desc' },
    });
    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.marketingAlarm).toBe(latest.agreed);
  });

  it('활성 회원이 부르면 HOME', async () => {
    const member = await createMember();
    const res = await agree(member.id, {
      terms: true,
      privacy: true,
      location: true,
      marketing: false,
    });
    expect(res.body.data.nextAction).toBe('HOME');
  });

  it('필수 약관을 빼면 REQUIRED_CONSENT_MISSING, 항목이 빠지면 VALIDATION_ERROR', async () => {
    const member = await createMember({ status: 'P', nickname: null });

    const refused = await agree(member.id, {
      terms: true,
      privacy: false,
      location: true,
      marketing: false,
    });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('REQUIRED_CONSENT_MISSING');

    const partial = await agree(member.id, { terms: true });
    expect(partial.status).toBe(400);
    expect(partial.body.code).toBe('VALIDATION_ERROR');
    expect(partial.body.message).toBe('동의 항목을 모두 보내 주세요.');
  });

  it('시행 중인 약관이 없으면 404 POLICY_DOCUMENT_NOT_FOUND', async () => {
    const member = await createMember({ status: 'P', nickname: null });
    await prisma.policyDocument.deleteMany();
    try {
      const res = await agree(member.id, {
        terms: true,
        privacy: true,
        location: true,
        marketing: false,
      });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('POLICY_DOCUMENT_NOT_FOUND');
      expect(await prisma.memberConsent.count()).toBe(0);
    } finally {
      await seedBaseData(prisma);
    }
  });

  it('로그인하지 않으면 401', async () => {
    const res = await request(app).post('/api/v1/users/me/consents').send({});
    expect(res.body.code).toBe('TOKEN_REQUIRED');
  });
});
