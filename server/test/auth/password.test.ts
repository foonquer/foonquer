import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { sendMail } from '../../src/lib/mailer';
import { prisma } from '../../src/lib/prisma';
import { hashSecret, verifySecret } from '../../src/modules/auth/password';
import { resetDb } from '../helpers/db';
import { bearer, createMember } from '../helpers/fixtures';
import { refreshCookieOf } from '../helpers/http';

vi.mock('../../src/lib/mailer', () => ({ sendMail: vi.fn() }));

const app = createApp();
const mockedSendMail = vi.mocked(sendMail);
const PASSWORD = 'mukjang2026';

async function emailMember(data: Parameters<typeof createMember>[0] = {}) {
  return createMember({
    email: 'junhyung@email.com',
    password: await hashSecret(PASSWORD),
    ...data,
  });
}

function requestReset(email: string) {
  return request(app).post('/api/v1/auth/password/reset-email').send({ email });
}

/** 마지막 재설정 메일의 링크에서 token을 꺼낸다 */
function lastResetToken() {
  const mail = mockedSendMail.mock.calls.at(-1)?.[0];
  const match = mail?.text.match(/\/password\/reset\?token=([^\s]+)/);
  if (!match) throw new Error('재설정 메일이 없습니다');
  return decodeURIComponent(match[1]);
}

function login(password: string) {
  return request(app).post('/api/v1/auth/login').send({ email: 'junhyung@email.com', password });
}

beforeEach(async () => {
  await resetDb();
  mockedSendMail.mockReset();
  mockedSendMail.mockResolvedValue(undefined);
});

describe('AUTH-12 POST /auth/password/reset-email', () => {
  it('가입한 이메일로 30분짜리 재설정 링크를 보낸다', async () => {
    await emailMember();

    const res = await requestReset('JunHyung@email.com');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { email: 'junhyung@email.com', expiresIn: 1800, resendAvailableIn: 60 },
      message: '메일을 보냈어요. 30분 안에 링크를 눌러 주세요.',
    });
    expect(mockedSendMail).toHaveBeenCalledTimes(1);
    expect(mockedSendMail.mock.calls[0][0].text).toContain(
      'http://localhost:5173/password/reset?token=',
    );
    expect(await prisma.authTemporaryToken.count({ where: { tokenType: 'PASSWORD_RESET' } })).toBe(
      1,
    );
  });

  it('가입하지 않았거나 소셜 전용 이메일에도 같은 응답을 주고 메일은 보내지 않는다', async () => {
    await createMember({ email: 'social@email.com', password: null });

    for (const email of ['nobody@email.com', 'social@email.com']) {
      const res = await requestReset(email);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ email, expiresIn: 1800, resendAvailableIn: 60 });
    }
    expect(mockedSendMail).not.toHaveBeenCalled();
  });

  it('60초 안에 다시 보내면 429 PASSWORD_RESET_RESEND_TOO_SOON (가입 여부와 상관없이)', async () => {
    await requestReset('nobody@email.com');
    const res = await requestReset('nobody@email.com');

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('PASSWORD_RESET_RESEND_TOO_SOON');
    expect(res.body.message).toMatch(/^\d+초 후에 다시 보낼 수 있어요\.$/);
  });

  it('다시 보내면 이전 링크는 무효가 된다', async () => {
    await emailMember();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      await requestReset('junhyung@email.com');
      const firstToken = lastResetToken();
      vi.setSystemTime(Date.now() + 61_000);
      await requestReset('junhyung@email.com');

      const old = await request(app)
        .get('/api/v1/auth/password/reset-token')
        .query({ token: firstToken });
      expect(old.body.code).toBe('PASSWORD_RESET_TOKEN_INVALID');
      const fresh = await request(app)
        .get('/api/v1/auth/password/reset-token')
        .query({ token: lastResetToken() });
      expect(fresh.status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it('같은 이메일로 1시간에 5번을 넘으면 429 PASSWORD_RESET_SEND_LIMIT', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      for (let i = 0; i < 5; i += 1) {
        expect((await requestReset('nobody@email.com')).status).toBe(200);
        vi.setSystemTime(Date.now() + 61_000);
      }
      const res = await requestReset('nobody@email.com');
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('PASSWORD_RESET_SEND_LIMIT');
    } finally {
      vi.useRealTimers();
    }
  });

  it('메일 발송 실패는 500 EMAIL_SEND_FAILED', async () => {
    await emailMember();
    mockedSendMail.mockRejectedValueOnce(new Error('ses down'));
    vi.spyOn(console, 'error').mockImplementationOnce(() => undefined);

    const res = await requestReset('junhyung@email.com');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('EMAIL_SEND_FAILED');
  });
});

describe('AUTH-13 GET /auth/password/reset-token', () => {
  it('유효하면 가린 이메일과 만료 시각(KST)을 주고 토큰은 소비하지 않는다', async () => {
    await emailMember();
    await requestReset('junhyung@email.com');
    const token = lastResetToken();

    const res = await request(app).get('/api/v1/auth/password/reset-token').query({ token });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('새 비밀번호를 정해 주세요.');
    expect(res.body.data.maskedEmail).toBe('jun***@email.com');
    expect(res.body.data.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
    const again = await request(app).get('/api/v1/auth/password/reset-token').query({ token });
    expect(again.status).toBe(200);
  });

  it('토큰이 없으면 400, 모르거나 만료된 토큰은 401', async () => {
    const missing = await request(app).get('/api/v1/auth/password/reset-token');
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('PASSWORD_RESET_TOKEN_REQUIRED');

    const unknown = await request(app)
      .get('/api/v1/auth/password/reset-token')
      .query({ token: 'nope' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.code).toBe('PASSWORD_RESET_TOKEN_INVALID');

    await emailMember();
    await requestReset('junhyung@email.com');
    await prisma.authTemporaryToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } });
    const expired = await request(app)
      .get('/api/v1/auth/password/reset-token')
      .query({ token: lastResetToken() });
    expect(expired.body.code).toBe('PASSWORD_RESET_TOKEN_EXPIRED');
  });
});

describe('AUTH-14 POST /auth/password/reset', () => {
  it('새 비밀번호로 바꾸고 모든 기기 로그아웃·잠금 해제, 링크는 다시 못 쓴다', async () => {
    const member = await emailMember({
      loginFailCount: 2,
      lockedUntil: new Date(Date.now() + 60_000),
    });
    await prisma.refreshToken.create({
      data: { userId: member.id, tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 1e7) },
    });
    await requestReset('junhyung@email.com');
    const token = lastResetToken();

    const res = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ token, newPassword: 'newmukjang99', newPasswordConfirm: 'newmukjang99' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: null,
      message: '비밀번호를 바꿨어요. 새 비밀번호로 다시 로그인해 주세요.',
    });
    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(await verifySecret('newmukjang99', after.password ?? '')).toBe(true);
    expect(after.loginFailCount).toBe(0);
    expect(after.lockedUntil).toBeNull();
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    expect((await login('newmukjang99')).status).toBe(200);

    const again = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ token, newPassword: 'another1234', newPasswordConfirm: 'another1234' });
    expect(again.status).toBe(401);
    expect(again.body.code).toBe('PASSWORD_RESET_TOKEN_INVALID');
  });

  it('지금 비밀번호와 같으면 400 SAME_AS_CURRENT_PASSWORD, 형식·확인 오류', async () => {
    await emailMember();
    await requestReset('junhyung@email.com');
    const token = lastResetToken();
    const send = (body: Record<string, unknown>) =>
      request(app)
        .post('/api/v1/auth/password/reset')
        .send({ token, ...body });

    const same = await send({ newPassword: PASSWORD, newPasswordConfirm: PASSWORD });
    expect(same.status).toBe(400);
    expect(same.body.code).toBe('SAME_AS_CURRENT_PASSWORD');

    const weak = await send({ newPassword: '12345678', newPasswordConfirm: '12345678' });
    expect(weak.body.code).toBe('INVALID_PASSWORD_FORMAT');

    const mismatch = await send({ newPassword: 'newmukjang99', newPasswordConfirm: 'nope12345' });
    expect(mismatch.body.code).toBe('PASSWORD_MISMATCH');
  });
});

describe('SET-05 PATCH /users/me/password', () => {
  function change(userId: bigint, body: Record<string, unknown>) {
    return request(app)
      .patch('/api/v1/users/me/password')
      .set('Authorization', bearer(userId))
      .send(body);
  }

  it('바꾸면 다른 기기는 로그아웃하고 지금 기기에 새 토큰·쿠키를 준다', async () => {
    const member = await emailMember();
    const otherDevice = refreshCookieOf(await login(PASSWORD));

    const res = await change(member.id, {
      currentPassword: PASSWORD,
      newPassword: 'newmukjang99',
      newPasswordConfirm: 'newmukjang99',
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해 주세요.');
    expect(res.body.data.accessTokenExpiresIn).toBe(3600);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.passwordChangedAt).toMatch(/\+09:00$/);

    const other = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refreshToken=${otherDevice}`);
    expect(other.status).toBe(401);
    const current = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refreshToken=${refreshCookieOf(res)}`);
    expect(current.status).toBe(200);
    expect((await login('newmukjang99')).status).toBe(200);
  });

  it('지금 비밀번호가 틀리면 400, 5번 틀리면 429 TOO_MANY_PASSWORD_ATTEMPTS', async () => {
    const member = await emailMember();
    const wrong = {
      currentPassword: 'wrong1234',
      newPassword: 'newmukjang99',
      newPasswordConfirm: 'newmukjang99',
    };

    for (let i = 0; i < 5; i += 1) {
      const res = await change(member.id, wrong);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CURRENT_PASSWORD_INCORRECT');
    }
    const blocked = await change(member.id, { ...wrong, currentPassword: PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_PASSWORD_ATTEMPTS');
    // 로그인 잠금과는 따로 센다.
    const row = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(row.loginFailCount).toBe(0);
  });

  it('같은 비밀번호·소셜 전용·프로필 설정 전 회원', async () => {
    const member = await emailMember();
    const same = await change(member.id, {
      currentPassword: PASSWORD,
      newPassword: PASSWORD,
      newPasswordConfirm: PASSWORD,
    });
    expect(same.status).toBe(400);
    expect(same.body.code).toBe('SAME_AS_CURRENT_PASSWORD');
    expect(same.body.message).toBe('지금 비밀번호와 다르게 정해 주세요.');

    const social = await createMember({ password: null });
    const noPassword = await change(social.id, {
      currentPassword: 'anything1',
      newPassword: 'newmukjang99',
      newPasswordConfirm: 'newmukjang99',
    });
    expect(noPassword.status).toBe(403);
    expect(noPassword.body.code).toBe('PASSWORD_NOT_SET');

    const pending = await createMember({ status: 'P', nickname: null, password: null });
    const notReady = await change(pending.id, {
      currentPassword: 'anything1',
      newPassword: 'newmukjang99',
      newPasswordConfirm: 'newmukjang99',
    });
    expect(notReady.status).toBe(403);
    expect(['TERMS_REQUIRED', 'PROFILE_REQUIRED']).toContain(notReady.body.code);
  });

  it('로그인하지 않으면 401 TOKEN_REQUIRED', async () => {
    const res = await request(app).patch('/api/v1/users/me/password').send({});
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_REQUIRED');
  });
});
