import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { sha256Hex } from '../../src/common/crypto';
import { prisma } from '../../src/lib/prisma';
import { createRefreshToken } from '../../src/modules/auth/refresh-token';
import { resetDb } from '../helpers/db';
import { createMember } from '../helpers/fixtures';
import { refreshCookieHeader, refreshCookieOf } from '../helpers/http';

const app = createApp();
/** 카카오 로그인(AUTH-08)을 마친 것처럼 이 회원의 refreshToken을 하나 발급한다 */
function login(memberId: bigint) {
  return createRefreshToken(prisma, memberId);
}

function refresh(token: string | null) {
  const req = request(app).post('/api/v1/auth/refresh');
  return token ? req.set('Cookie', `refreshToken=${token}`) : req;
}

beforeEach(async () => {
  await resetDb();
});

describe('AUTH-10 POST /auth/refresh', () => {
  it('새 accessToken과 새 refreshToken을 주고 쓴 토큰은 폐기한다', async () => {
    const member = await createMember();
    const first = await login(member.id);

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
    const member = await createMember();
    const first = await login(member.id);
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

    const member = await createMember();
    const token = await login(member.id);
    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } });
    const expired = await refresh(token);
    expect(expired.body.code).toBe('REFRESH_TOKEN_EXPIRED');
  });

  it('정지 회원은 403 MEMBER_SUSPENDED, 탈퇴 회원은 403 MEMBER_WITHDRAWN', async () => {
    const member = await createMember();
    const token = await login(member.id);

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
    const member = await createMember({ status: 'P', nickname: null });
    const token = await login(member.id);

    const res = await refresh(token);

    expect(res.body.data.nextAction).toBe('TERMS_REQUIRED');
  });
});

describe('AUTH-11 POST /auth/logout', () => {
  it('이 기기의 refreshToken만 폐기하고 쿠키를 지운다', async () => {
    const member = await createMember();
    const phone = await login(member.id);
    const laptop = await login(member.id);

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
