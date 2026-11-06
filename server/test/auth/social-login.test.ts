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

/** AUTH-07을 거친 것처럼 카카오 회원번호로 일회용 코드를 만든다 */
function resultCode(kakaoId: string) {
  return createOAuthResultCode({ kakaoId });
}

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AUTH-06 GET /auth/oauth/kakao', () => {
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
    // 이메일·닉네임 같은 동의 항목은 요청하지 않는다 (카카오 회원번호만 쓴다).
    expect(location.searchParams.get('scope')).toBeNull();

    const stateCookie = cookiesOf(res).find((c) => c.startsWith('oauth_state='));
    expect(stateCookie).toContain('HttpOnly');
    expect(stateCookie).toContain('Path=/api/v1/auth/oauth');
    expect(stateCookie).toContain('Max-Age=600');
    expect(stateCookie?.split(';')[0]).toBe(`oauth_state=${location.searchParams.get('state')}`);
  });

  it('구글 로그인 주소는 없다 (404)', async () => {
    const res = await request(app).get('/api/v1/auth/oauth/google');

    expect(res.status).toBe(404);
  });
});

describe('AUTH-07 GET /auth/oauth/kakao/callback', () => {
  function callback(query: Record<string, string>, state: string | null = 'state-1') {
    const req = request(app).get('/api/v1/auth/oauth/kakao/callback').query(query);
    return state ? req.set('Cookie', `oauth_state=${state}`) : req;
  }

  it('카카오 회원번호를 받아 1분짜리 일회용 코드만 붙여 프론트로 보낸다', async () => {
    const fetchMock = stubKakao({ id: 4242 });

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
    expect(row.payload).toEqual({ kakaoId: '4242' });
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

  it('카카오 요청이 실패하면 SOCIAL_LOGIN_FAILED', async () => {
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
  it('② 처음 온 카카오 계정은 회원(P)을 만들고 TERMS_REQUIRED로 로그인시킨다', async () => {
    const res = await exchange(await resultCode('k-new'));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('약관에 동의하고 프로필을 설정해 주세요.');
    expect(res.body.data).toMatchObject({
      nextAction: 'TERMS_REQUIRED',
      isNewUser: true,
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: { nickname: null, profileImageUrl: null, status: 'P' },
    });
    expect(res.body.data.user).not.toHaveProperty('email');
    expect(refreshCookieOf(res)).toBeTruthy();

    const member = await prisma.member.findUniqueOrThrow({ where: { kakaoId: 'k-new' } });
    expect(member.status).toBe('P');
    expect(member.lastLoginAt).not.toBeNull();
  });

  it('① 이미 가입한 카카오 계정이면 그 회원으로 로그인한다', async () => {
    const member = await createMember({ kakaoId: 'k-1', nickname: '아기깨비' });

    const res = await exchange(await resultCode('k-1'));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('로그인했어요.');
    expect(res.body.data).toMatchObject({
      nextAction: 'HOME',
      isNewUser: false,
      user: { id: Number(member.id), nickname: '아기깨비', status: 'A' },
    });
    expect(await prisma.member.count()).toBe(1);
  });

  it('① 가입 절차가 남은 회원은 약관 동의 여부에 따라 TERMS_REQUIRED / PROFILE_REQUIRED', async () => {
    const member = await createMember({ kakaoId: 'k-1', status: 'P', nickname: null });

    const before = await exchange(await resultCode('k-1'));
    expect(before.body.data.nextAction).toBe('TERMS_REQUIRED');

    await agreeConsents(member.id);
    const after = await exchange(await resultCode('k-1'));
    expect(after.body.data.nextAction).toBe('PROFILE_REQUIRED');
  });

  it('① 이용 정지 회원은 403 MEMBER_SUSPENDED', async () => {
    await createMember({ kakaoId: 'k-1', status: 'S' });

    const res = await exchange(await resultCode('k-1'));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MEMBER_SUSPENDED');
  });

  it('탈퇴하면 kakao_id를 비우므로 같은 카카오 계정은 새 회원으로 가입한다', async () => {
    const withdrawn = await createMember({ kakaoId: null, status: 'D', nickname: null });

    const res = await exchange(await resultCode('k-1'));

    expect(res.body.data).toMatchObject({ nextAction: 'TERMS_REQUIRED', isNewUser: true });
    const member = await prisma.member.findUniqueOrThrow({ where: { kakaoId: 'k-1' } });
    expect(member.id).not.toBe(withdrawn.id);
  });

  it('같은 카카오 계정으로 동시에 처음 들어와도 회원은 한 명만 생긴다', async () => {
    const [a, b] = await Promise.all([
      exchange(await resultCode('k-1')),
      exchange(await resultCode('k-1')),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await prisma.member.count({ where: { kakaoId: 'k-1' } })).toBe(1);
    expect(a.body.data.user.id).toBe(b.body.data.user.id);
  });

  it('코드는 한 번만 쓸 수 있고, 만료되면 401, 없으면 400', async () => {
    const code = await resultCode('k-1');
    await exchange(code);

    const reused = await exchange(code);
    expect(reused.status).toBe(400);
    expect(reused.body.code).toBe('OAUTH_RESULT_CODE_INVALID');

    const unknown = await exchange('made-up');
    expect(unknown.body.code).toBe('OAUTH_RESULT_CODE_INVALID');

    const late = await resultCode('k-2');
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

  it('카카오 전용 전에 발급된 결과 코드(kakaoId 없는 payload)는 400 OAUTH_RESULT_CODE_INVALID', async () => {
    const code = await resultCode('k-1');
    await prisma.authTemporaryToken.updateMany({
      where: { usedAt: null },
      data: { payload: { provider: 'KAKAO', providerId: 'k-1', email: null } },
    });

    const res = await exchange(code);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OAUTH_RESULT_CODE_INVALID');
    expect(await prisma.member.count()).toBe(0);
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
