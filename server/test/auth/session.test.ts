import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { sha256Hex } from '../../src/common/crypto';
import { prisma } from '../../src/lib/prisma';
import { hashSecret } from '../../src/modules/auth/password';
import { resetDb } from '../helpers/db';
import { agreeConsents, createMember } from '../helpers/fixtures';
import { refreshCookieHeader, refreshCookieOf } from '../helpers/http';

const app = createApp();
const PASSWORD = 'mukjang2026';

async function emailMember(data: Parameters<typeof createMember>[0] = {}) {
  return createMember({
    email: 'junhyung@email.com',
    password: await hashSecret(PASSWORD),
    ...data,
  });
}

function login(email: string, password: string) {
  return request(app).post('/api/v1/auth/login').send({ email, password });
}

function refresh(token: string | null) {
  const req = request(app).post('/api/v1/auth/refresh');
  return token ? req.set('Cookie', `refreshToken=${token}`) : req;
}

beforeEach(async () => {
  await resetDb();
});

describe('AUTH-05 POST /auth/login', () => {
  it('맞으면 토큰·쿠키를 주고 실패 횟수를 0으로, 마지막 로그인 시각을 기록한다', async () => {
    const member = await emailMember({ loginFailCount: 3, nickname: '아기깨비' });

    const res = await login(' JunHyung@Email.com ', PASSWORD);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('로그인했어요.');
    expect(res.body.data).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 3600,
      nextAction: 'HOME',
      user: {
        id: Number(member.id),
        email: 'junhyung@email.com',
        nickname: '아기깨비',
        profileImageUrl: null,
        status: 'A',
      },
    });
    expect(refreshCookieOf(res)).toBeTruthy();
    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.loginFailCount).toBe(0);
    expect(after.lastLoginAt).not.toBeNull();
  });

  it('프로필 설정 전이면 nextAction PROFILE_REQUIRED (약관 동의를 안 했으면 TERMS_REQUIRED)', async () => {
    const pending = await emailMember({ status: 'P', nickname: null });

    const noTerms = await login('junhyung@email.com', PASSWORD);
    expect(noTerms.body.data.nextAction).toBe('TERMS_REQUIRED');

    await agreeConsents(pending.id);
    const res = await login('junhyung@email.com', PASSWORD);
    expect(res.body.data.nextAction).toBe('PROFILE_REQUIRED');
    expect(res.body.data.user.status).toBe('P');
  });

  it('틀리면 401과 실패 횟수, 5번째에 423 LOGIN_LOCKED로 10분 잠근다', async () => {
    const member = await emailMember();

    for (let i = 1; i <= 4; i += 1) {
      const res = await login('junhyung@email.com', 'wrong1234');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        success: false,
        code: 'LOGIN_INVALID_CREDENTIALS',
        message: '이메일 또는 비밀번호가 맞지 않아요.',
        data: { failCount: i, maxFailCount: 5 },
      });
    }

    const fifth = await login('junhyung@email.com', 'wrong1234');
    expect(fifth.status).toBe(423);
    expect(fifth.body.code).toBe('LOGIN_LOCKED');
    expect(fifth.body.data.lockedUntil).toMatch(/\+09:00$/);

    // 잠겨 있는 동안은 맞는 비밀번호도 막는다.
    const locked = await login('junhyung@email.com', PASSWORD);
    expect(locked.status).toBe(423);

    const row = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(row.loginFailCount).toBe(0);
    expect(row.lockedUntil).not.toBeNull();

    // 잠금이 풀리면 로그인된다.
    await prisma.member.update({
      where: { id: member.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    expect((await login('junhyung@email.com', PASSWORD)).status).toBe(200);
  });

  it('가입하지 않은 이메일·소셜 전용 계정은 같은 코드로 답하고 failCount는 null', async () => {
    await createMember({ email: 'social@email.com', password: null });

    for (const email of ['nobody@email.com', 'social@email.com', 'not-an-email']) {
      const res = await login(email, PASSWORD);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('LOGIN_INVALID_CREDENTIALS');
      expect(res.body.data).toEqual({ failCount: null, maxFailCount: 5 });
    }
  });

  it('이용 정지 회원은 403 MEMBER_SUSPENDED, 탈퇴 회원은 가입하지 않은 이메일과 같다', async () => {
    await emailMember({ status: 'S' });
    const suspended = await login('junhyung@email.com', PASSWORD);
    expect(suspended.status).toBe(403);
    expect(suspended.body.code).toBe('MEMBER_SUSPENDED');

    await prisma.member.updateMany({ data: { status: 'D' } });
    const withdrawn = await login('junhyung@email.com', PASSWORD);
    expect(withdrawn.body.code).toBe('LOGIN_INVALID_CREDENTIALS');
  });

  it('이메일이나 비밀번호가 비어 있으면 400 VALIDATION_ERROR와 명세 문구', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@b.com' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toBe('이메일과 비밀번호를 입력해 주세요.');
  });
});

describe('AUTH-10 POST /auth/refresh', () => {
  it('새 accessToken과 새 refreshToken을 주고 쓴 토큰은 폐기한다', async () => {
    await emailMember();
    const loginRes = await login('junhyung@email.com', PASSWORD);
    const first = refreshCookieOf(loginRes);

    const res = await refresh(first);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('토큰을 재발급했어요.');
    expect(res.body.data).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 3600,
      nextAction: 'HOME',
    });
    const second = refreshCookieOf(res);
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    const old = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: sha256Hex(first ?? '') },
    });
    expect(old.revokedAt).not.toBeNull();
  });

  it('이미 쓴(폐기된) 토큰이 다시 오면 401 REFRESH_TOKEN_INVALID이고 그 회원의 토큰을 모두 폐기한다', async () => {
    const member = await emailMember();
    const first = refreshCookieOf(await login('junhyung@email.com', PASSWORD));
    const second = refreshCookieOf(await refresh(first));

    const reuse = await refresh(first);
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('REFRESH_TOKEN_INVALID');
    expect(refreshCookieHeader(reuse)).toContain('Max-Age=0');

    // 탈취를 의심해 정상 기기의 토큰도 막힌다.
    const legit = await refresh(second);
    expect(legit.body.code).toBe('REFRESH_TOKEN_INVALID');
    expect(await prisma.refreshToken.count({ where: { userId: member.id, revokedAt: null } })).toBe(
      0,
    );
  });

  it('쿠키가 없으면 REFRESH_TOKEN_REQUIRED, 모르는 토큰은 INVALID, 만료면 EXPIRED', async () => {
    const none = await refresh(null);
    expect(none.status).toBe(401);
    expect(none.body.code).toBe('REFRESH_TOKEN_REQUIRED');

    const unknown = await refresh('made-up');
    expect(unknown.body.code).toBe('REFRESH_TOKEN_INVALID');

    await emailMember();
    const token = refreshCookieOf(await login('junhyung@email.com', PASSWORD));
    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } });
    const expired = await refresh(token);
    expect(expired.body.code).toBe('REFRESH_TOKEN_EXPIRED');
  });

  it('정지 회원은 403 MEMBER_SUSPENDED, 탈퇴 회원은 403 MEMBER_WITHDRAWN', async () => {
    const member = await emailMember();
    const token = refreshCookieOf(await login('junhyung@email.com', PASSWORD));

    await prisma.member.update({ where: { id: member.id }, data: { status: 'S' } });
    const suspended = await refresh(token);
    expect(suspended.status).toBe(403);
    expect(suspended.body.code).toBe('MEMBER_SUSPENDED');

    await prisma.member.update({ where: { id: member.id }, data: { status: 'D' } });
    const withdrawn = await refresh(token);
    expect(withdrawn.status).toBe(403);
    expect(withdrawn.body.code).toBe('MEMBER_WITHDRAWN');
  });

  it('프로필 설정 전 회원은 nextAction으로 가입 절차를 알려 준다', async () => {
    await emailMember({ status: 'P', nickname: null });
    const token = refreshCookieOf(await login('junhyung@email.com', PASSWORD));

    const res = await refresh(token);

    expect(res.body.data.nextAction).toBe('TERMS_REQUIRED');
  });
});

describe('AUTH-11 POST /auth/logout', () => {
  it('이 기기의 refreshToken만 폐기하고 쿠키를 지운다', async () => {
    await emailMember();
    const phone = refreshCookieOf(await login('junhyung@email.com', PASSWORD));
    const laptop = refreshCookieOf(await login('junhyung@email.com', PASSWORD));

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', `refreshToken=${phone}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: null, message: '로그아웃했어요.' });
    expect(refreshCookieHeader(res)).toContain('Max-Age=0');
    expect((await refresh(phone)).status).toBe(401);
    expect((await refresh(laptop)).status).toBe(200);
  });

  it('쿠키가 없거나 이미 로그아웃했어도 성공한다', async () => {
    expect((await request(app).post('/api/v1/auth/logout')).status).toBe(200);
    expect(
      (await request(app).post('/api/v1/auth/logout').set('Cookie', 'refreshToken=unknown')).status,
    ).toBe(200);
  });
});
