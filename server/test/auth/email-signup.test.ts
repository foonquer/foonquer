import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { sha256Hex } from '../../src/common/crypto';
import { sendMail } from '../../src/lib/mailer';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from '../helpers/db';
import { createMember } from '../helpers/fixtures';
import { refreshCookieHeader, refreshCookieOf } from '../helpers/http';

vi.mock('../../src/lib/mailer', () => ({ sendMail: vi.fn() }));

const app = createApp();
const mockedSendMail = vi.mocked(sendMail);

/** 마지막으로 보낸 인증 메일의 6자리 코드 */
function lastCode() {
  const mail = mockedSendMail.mock.calls.at(-1)?.[0];
  const match = mail?.text.match(/인증 코드: (\d{6})/);
  if (!match) throw new Error('인증 메일이 없습니다');
  return match[1];
}

async function sendCode(email: string) {
  return request(app).post('/api/v1/auth/email/verification-code').send({ email });
}

async function verify(email: string, code: string) {
  return request(app).post('/api/v1/auth/email/verification-code/verify').send({ email, code });
}

/** AUTH-02 → AUTH-03을 거쳐 가입용 토큰을 받는다 */
async function verifiedToken(email: string) {
  await sendCode(email);
  const res = await verify(email, lastCode());
  return res.body.data.emailVerificationToken as string;
}

function signupBody(email: string, token: string, overrides: Record<string, unknown> = {}) {
  return {
    email,
    password: 'mukjang2026',
    passwordConfirm: 'mukjang2026',
    emailVerificationToken: token,
    consents: { terms: true, privacy: true, location: true, marketing: false },
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDb();
  mockedSendMail.mockReset();
  mockedSendMail.mockResolvedValue(undefined);
});

describe('AUTH-01 GET /auth/email/availability', () => {
  it('쓸 수 있는 이메일이면 available true, 이메일은 공백 제거·소문자로 돌려준다', async () => {
    const res = await request(app)
      .get('/api/v1/auth/email/availability')
      .query({ email: '  JunHyung@Email.com ' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { email: 'junhyung@email.com', available: true, reason: null, provider: null },
      message: '사용할 수 있는 이메일이에요.',
    });
  });

  it('이메일 계정이 있으면 EMAIL_ALREADY_EXISTS, 소셜 계정이 있으면 SOCIAL_ACCOUNT_EXISTS와 provider', async () => {
    await createMember({ email: 'used@email.com' });
    const social = await createMember();
    await prisma.socialAccount.create({
      data: { userId: social.id, provider: 'K', providerId: 'k-1', email: 'kakao@email.com' },
    });

    const used = await request(app)
      .get('/api/v1/auth/email/availability')
      .query({ email: 'used@email.com' });
    expect(used.body.data).toMatchObject({
      available: false,
      reason: 'EMAIL_ALREADY_EXISTS',
      provider: null,
    });

    const kakao = await request(app)
      .get('/api/v1/auth/email/availability')
      .query({ email: 'kakao@email.com' });
    expect(kakao.body.data).toMatchObject({
      available: false,
      reason: 'SOCIAL_ACCOUNT_EXISTS',
      provider: 'K',
    });
    expect(kakao.body.message).toBe('카카오로 가입한 이메일이에요. 카카오로 로그인해 주세요.');
  });

  it('탈퇴한 회원의 이메일은 다시 쓸 수 있다', async () => {
    await createMember({ email: 'gone@email.com', status: 'D', nickname: null });

    const res = await request(app)
      .get('/api/v1/auth/email/availability')
      .query({ email: 'gone@email.com' });

    expect(res.body.data.available).toBe(true);
  });

  it('이메일이 없으면 EMAIL_REQUIRED, 형식이 틀리면 INVALID_EMAIL_FORMAT', async () => {
    const missing = await request(app).get('/api/v1/auth/email/availability');
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('EMAIL_REQUIRED');

    const wrong = await request(app)
      .get('/api/v1/auth/email/availability')
      .query({ email: 'not-an-email' });
    expect(wrong.body.code).toBe('INVALID_EMAIL_FORMAT');
  });

  it('같은 IP에서 1분에 30번을 넘으면 429 TOO_MANY_REQUESTS', async () => {
    for (let i = 0; i < 30; i += 1) {
      const ok = await request(app)
        .get('/api/v1/auth/email/availability')
        .query({ email: `a${i}@email.com` });
      expect(ok.status).toBe(200);
    }
    const res = await request(app)
      .get('/api/v1/auth/email/availability')
      .query({ email: 'last@email.com' });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('AUTH-02 POST /auth/email/verification-code', () => {
  it('6자리 코드를 메일로 보내고 유효시간·재발송 대기 시간을 준다', async () => {
    const res = await sendCode('New@Email.com');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { email: 'new@email.com', expiresIn: 300, resendAvailableIn: 60 },
      message: '인증 코드를 보냈어요. 5분 안에 입력해 주세요.',
    });
    expect(mockedSendMail).toHaveBeenCalledTimes(1);
    expect(mockedSendMail.mock.calls[0][0].to).toBe('new@email.com');
    expect(lastCode()).toMatch(/^\d{6}$/);

    const rows = await prisma.authTemporaryToken.findMany({ where: { tokenType: 'EMAIL_VERIFY' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ email: 'new@email.com', attempts: 0 });
  });

  it('이미 가입한 이메일이면 409 EMAIL_ALREADY_EXISTS, 소셜이면 SOCIAL_ACCOUNT_EXISTS', async () => {
    await createMember({ email: 'used@email.com' });
    const social = await createMember();
    await prisma.socialAccount.create({
      data: { userId: social.id, provider: 'G', providerId: 'g-1', email: 'google@email.com' },
    });

    const used = await sendCode('used@email.com');
    expect(used.status).toBe(409);
    expect(used.body.code).toBe('EMAIL_ALREADY_EXISTS');

    const google = await sendCode('google@email.com');
    expect(google.status).toBe(409);
    expect(google.body.code).toBe('SOCIAL_ACCOUNT_EXISTS');
    expect(google.body.message).toBe('구글로 가입한 이메일이에요.');
    expect(mockedSendMail).not.toHaveBeenCalled();
  });

  it('60초 안에 다시 보내면 429 VERIFICATION_CODE_RESEND_TOO_SOON', async () => {
    await sendCode('new@email.com');
    const res = await sendCode('new@email.com');

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('VERIFICATION_CODE_RESEND_TOO_SOON');
    expect(res.body.message).toMatch(/^\d+초 후에 다시 보낼 수 있어요\.$/);
  });

  it('60초가 지나 다시 보내면 이전 코드는 무효가 된다', async () => {
    await sendCode('new@email.com');
    const firstCode = lastCode();
    await prisma.authTemporaryToken.updateMany({
      data: { regDate: new Date(Date.now() - 61_000) },
    });

    const res = await sendCode('new@email.com');
    expect(res.status).toBe(200);

    const rows = await prisma.authTemporaryToken.findMany({
      where: { tokenType: 'EMAIL_VERIFY' },
      orderBy: { id: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].usedAt).not.toBeNull();
    expect(rows[1].usedAt).toBeNull();

    // 새 코드와 우연히 같지 않다면 옛 코드는 틀린 코드로 처리된다.
    if (firstCode !== lastCode()) {
      const old = await verify('new@email.com', firstCode);
      expect(old.body.code).toBe('VERIFICATION_CODE_MISMATCH');
    }
  });

  it('같은 이메일로 1시간에 5번 보냈으면 429 VERIFICATION_CODE_SEND_LIMIT', async () => {
    for (let i = 0; i < 5; i += 1) {
      await prisma.authTemporaryToken.create({
        data: {
          tokenHash: sha256Hex(`limit-${i}`),
          tokenType: 'EMAIL_VERIFY',
          payload: { email: 'new@email.com', codeHash: 'x', attempts: 0 },
          expiresAt: new Date(Date.now() + 60_000),
          regDate: new Date(Date.now() - (10 + i) * 60_000),
        },
      });
    }

    const res = await sendCode('new@email.com');

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('VERIFICATION_CODE_SEND_LIMIT');
  });

  it('같은 IP에서 1분에 10번을 넘으면 이메일이 달라도 429 TOO_MANY_REQUESTS', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await sendCode(`user${i}@email.com`)).status).toBe(200);
    }
    const res = await sendCode('user10@email.com');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('TOO_MANY_REQUESTS');
  });

  it('메일 발송에 실패하면 500 EMAIL_SEND_FAILED이고 DB에 남기지 않는다', async () => {
    mockedSendMail.mockRejectedValueOnce(new Error('ses down'));
    vi.spyOn(console, 'error').mockImplementationOnce(() => undefined);

    const res = await sendCode('new@email.com');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('EMAIL_SEND_FAILED');
    expect(await prisma.authTemporaryToken.count()).toBe(0);
  });
});

describe('AUTH-03 POST /auth/email/verification-code/verify', () => {
  it('코드가 맞으면 30분짜리 emailVerificationToken을 준다', async () => {
    await sendCode('new@email.com');

    const res = await verify('new@email.com', lastCode());

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('이메일 인증이 완료되었어요.');
    expect(res.body.data.expiresIn).toBe(1800);
    const verified = await prisma.authTemporaryToken.findFirst({
      where: { tokenType: 'EMAIL_VERIFIED' },
    });
    expect(verified?.tokenHash).toBe(sha256Hex(res.body.data.emailVerificationToken));
    expect(verified?.payload).toEqual({ email: 'new@email.com' });
  });

  it('틀리면 VERIFICATION_CODE_MISMATCH와 남은 횟수, 5번째는 429로 코드를 무효화한다', async () => {
    await sendCode('new@email.com');
    const wrong = lastCode() === '000000' ? '111111' : '000000';

    for (let i = 1; i <= 4; i += 1) {
      const res = await verify('new@email.com', wrong);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        code: 'VERIFICATION_CODE_MISMATCH',
        message: `인증 코드가 맞지 않아요. (${5 - i}번 남았어요)`,
        data: { remainingAttempts: 5 - i },
      });
    }
    const fifth = await verify('new@email.com', wrong);
    expect(fifth.status).toBe(429);
    expect(fifth.body.code).toBe('VERIFICATION_ATTEMPTS_EXCEEDED');

    // 무효가 된 뒤에는 맞는 코드도 받지 않는다.
    const after = await verify('new@email.com', lastCode());
    expect(after.body.code).toBe('VERIFICATION_ATTEMPTS_EXCEEDED');
  });

  it('틀린 코드를 동시에 여러 번 보내도 5번까지만 확인하고 코드를 무효화한다', async () => {
    await sendCode('new@email.com');
    const right = lastCode();
    const wrong = right === '000000' ? '111111' : '000000';

    const results = await Promise.all(
      Array.from({ length: 7 }, () => verify('new@email.com', wrong)),
    );

    const codes = results.map((r) => r.body.code as string);
    expect(codes.filter((c) => c === 'VERIFICATION_CODE_MISMATCH')).toHaveLength(4);
    expect(codes.filter((c) => c === 'VERIFICATION_ATTEMPTS_EXCEEDED')).toHaveLength(3);
    const row = await prisma.authTemporaryToken.findFirstOrThrow({
      where: { tokenType: 'EMAIL_VERIFY' },
    });
    expect(row.payload).toMatchObject({ attempts: 5 });
    expect(row.usedAt).not.toBeNull();
    expect((await verify('new@email.com', right)).body.code).toBe('VERIFICATION_ATTEMPTS_EXCEEDED');
  });

  it('만료된 코드는 VERIFICATION_CODE_EXPIRED, 요청이 없으면 404', async () => {
    const none = await verify('nobody@email.com', '123456');
    expect(none.status).toBe(404);
    expect(none.body.code).toBe('VERIFICATION_REQUEST_NOT_FOUND');

    await sendCode('new@email.com');
    await prisma.authTemporaryToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } });
    const expired = await verify('new@email.com', lastCode());
    expect(expired.status).toBe(400);
    expect(expired.body.code).toBe('VERIFICATION_CODE_EXPIRED');
  });

  it('이미 쓴 코드는 다시 쓸 수 없다', async () => {
    await sendCode('new@email.com');
    const code = lastCode();
    await verify('new@email.com', code);

    const again = await verify('new@email.com', code);
    expect(again.status).toBe(404);
    expect(again.body.code).toBe('VERIFICATION_REQUEST_NOT_FOUND');
  });

  it('코드 형식 오류', async () => {
    const missing = await request(app)
      .post('/api/v1/auth/email/verification-code/verify')
      .send({ email: 'new@email.com' });
    expect(missing.body.code).toBe('VERIFICATION_CODE_REQUIRED');

    const short = await verify('new@email.com', '12a45');
    expect(short.body.code).toBe('INVALID_VERIFICATION_CODE_FORMAT');
  });
});

describe('AUTH-04 POST /auth/signup', () => {
  it('status P 회원을 만들고 약관 동의·refreshToken 쿠키와 함께 로그인 상태로 만든다', async () => {
    const token = await verifiedToken('new@email.com');

    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send(
        signupBody('New@Email.com', token, {
          consents: { terms: true, privacy: true, location: true, marketing: true },
        }),
      );

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('가입했어요. 프로필을 설정해 주세요.');
    expect(res.body.data).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 3600,
      nextAction: 'PROFILE_REQUIRED',
      user: { email: 'new@email.com', nickname: null, profileImageUrl: null, status: 'P' },
    });
    expect(typeof res.body.data.accessToken).toBe('string');

    const cookie = refreshCookieHeader(res);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toContain('Max-Age=1209600');

    const member = await prisma.member.findFirstOrThrow({ where: { email: 'new@email.com' } });
    expect(member.status).toBe('P');
    expect(member.password).not.toBe('mukjang2026');
    expect(member.marketingAlarm).toBe(true);
    const consents = await prisma.memberConsent.findMany({ where: { userId: member.id } });
    expect(consents.map((c) => c.consentType).sort()).toEqual([
      'LOCATION',
      'MARKETING',
      'PRIVACY',
      'TERMS',
    ]);
    expect(consents.every((c) => c.policyVersion === '2026-09-01' && c.agreed)).toBe(true);
    expect(
      await prisma.refreshToken.count({
        where: { userId: member.id, tokenHash: sha256Hex(refreshCookieOf(res) ?? '') },
      }),
    ).toBe(1);
    // 먹깨비·내 동네는 프로필 설정(USER-03)에서 만든다.
    expect(await prisma.mukkaebi.count()).toBe(0);
  });

  it('인증 토큰은 한 번만 쓸 수 있다', async () => {
    const token = await verifiedToken('new@email.com');
    await request(app).post('/api/v1/auth/signup').send(signupBody('new@email.com', token));

    const again = await request(app)
      .post('/api/v1/auth/signup')
      .send(signupBody('new@email.com', token));
    expect(again.status).toBe(401);
    expect(again.body.code).toBe('EMAIL_VERIFICATION_TOKEN_INVALID');
  });

  it('인증한 이메일과 다르면 400 EMAIL_VERIFICATION_MISMATCH', async () => {
    const token = await verifiedToken('new@email.com');

    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send(signupBody('other@email.com', token));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMAIL_VERIFICATION_MISMATCH');
  });

  it('토큰이 만료되면 401 EMAIL_VERIFICATION_TOKEN_EXPIRED, 없으면 INVALID', async () => {
    const token = await verifiedToken('new@email.com');
    await prisma.authTemporaryToken.updateMany({
      where: { tokenType: 'EMAIL_VERIFIED' },
      data: { expiresAt: new Date(Date.now() - 1) },
    });

    const expired = await request(app)
      .post('/api/v1/auth/signup')
      .send(signupBody('new@email.com', token));
    expect(expired.status).toBe(401);
    expect(expired.body.code).toBe('EMAIL_VERIFICATION_TOKEN_EXPIRED');

    const unknown = await request(app)
      .post('/api/v1/auth/signup')
      .send(signupBody('new@email.com', 'made-up-token'));
    expect(unknown.body.code).toBe('EMAIL_VERIFICATION_TOKEN_INVALID');
  });

  it('입력값 오류: 비밀번호 형식, 비밀번호 확인, 필수 약관, 필수 필드 누락', async () => {
    const send = (body: Record<string, unknown>) =>
      request(app).post('/api/v1/auth/signup').send(body);

    const weak = await send(
      signupBody('new@email.com', 't', { password: 'onlyletters', passwordConfirm: 'onlyletters' }),
    );
    expect(weak.body.code).toBe('INVALID_PASSWORD_FORMAT');

    const spaced = await send(
      signupBody('new@email.com', 't', { password: 'abcd 1234', passwordConfirm: 'abcd 1234' }),
    );
    expect(spaced.body.code).toBe('INVALID_PASSWORD_FORMAT');

    const mismatch = await send(signupBody('new@email.com', 't', { passwordConfirm: 'other1234' }));
    expect(mismatch.body.code).toBe('PASSWORD_MISMATCH');

    const consent = await send(
      signupBody('new@email.com', 't', {
        consents: { terms: true, privacy: true, location: false, marketing: true },
      }),
    );
    expect(consent.body.code).toBe('REQUIRED_CONSENT_MISSING');

    const missing = await send({ email: 'new@email.com', password: 'mukjang2026' });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('VALIDATION_ERROR');
  });

  it('인증 후에 같은 이메일로 다른 계정이 생겼으면 409 EMAIL_ALREADY_EXISTS', async () => {
    const token = await verifiedToken('new@email.com');
    await createMember({ email: 'new@email.com' });

    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send(signupBody('new@email.com', token));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
  });
});
