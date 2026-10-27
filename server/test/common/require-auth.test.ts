import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { getAuthUser, requireAuth } from '../../src/common/auth/require-auth';
import { errorHandler } from '../../src/common/middlewares/error-handler';
import { ok } from '../../src/common/response';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from '../helpers/db';
import { agreeConsents, bearer, createMember } from '../helpers/fixtures';

function buildApp() {
  const app = express();
  for (const level of ['terms', 'profile', 'active'] as const) {
    app.get(`/${level}`, requireAuth(level), (req, res) => {
      const { userId, status } = getAuthUser(req);
      ok(res, { userId: userId.toString(), status });
    });
  }
  app.use(errorHandler);
  return app;
}

const app = buildApp();

beforeEach(async () => {
  await resetDb();
});

describe('requireAuth() 토큰 확인', () => {
  it('Authorization 헤더가 없으면 401 TOKEN_REQUIRED', async () => {
    const res = await request(app).get('/active');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, code: 'TOKEN_REQUIRED', data: null });
  });

  it('Bearer가 아니거나 위조된 토큰이면 401 TOKEN_INVALID', async () => {
    const member = await createMember();

    const basic = await request(app).get('/active').set('Authorization', 'Basic abc');
    expect(basic.body.code).toBe('TOKEN_INVALID');

    const forged = jwt.sign({ typ: 'access' }, 'another-secret-another-secret-12345', {
      subject: member.id.toString(),
    });
    const res = await request(app).get('/active').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });

  it('만료된 토큰이면 401 TOKEN_EXPIRED', async () => {
    const member = await createMember();
    const expired = jwt.sign({ typ: 'access' }, process.env.JWT_ACCESS_SECRET ?? '', {
      subject: member.id.toString(),
      expiresIn: -10,
    });

    const res = await request(app).get('/active').set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('없는 회원이나 탈퇴한 회원의 토큰이면 401 TOKEN_INVALID', async () => {
    const withdrawn = await createMember({ status: 'D', nickname: null });

    const res = await request(app).get('/terms').set('Authorization', bearer(withdrawn.id));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');

    const ghost = await request(app).get('/terms').set('Authorization', bearer(999_999n));
    expect(ghost.body.code).toBe('TOKEN_INVALID');
  });

  it('이용 정지 회원은 403 MEMBER_SUSPENDED', async () => {
    const suspended = await createMember({ status: 'S' });

    const res = await request(app).get('/terms').set('Authorization', bearer(suspended.id));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MEMBER_SUSPENDED');
  });
});

describe('requireAuth() 회원 상태별 접근', () => {
  it('약관 동의 전 회원(P)은 terms만 통과하고 나머지는 TERMS_REQUIRED', async () => {
    const member = await createMember({ status: 'P', nickname: null });
    const auth = bearer(member.id);

    const terms = await request(app).get('/terms').set('Authorization', auth);
    expect(terms.status).toBe(200);
    expect(terms.body.data).toEqual({ userId: member.id.toString(), status: 'P' });

    for (const path of ['/profile', '/active']) {
      const res = await request(app).get(path).set('Authorization', auth);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('TERMS_REQUIRED');
    }
  });

  it('약관 동의 후 프로필 설정 전 회원(P)은 profile까지 통과하고 active는 PROFILE_REQUIRED', async () => {
    const member = await createMember({ status: 'P', nickname: null });
    await agreeConsents(member.id);
    const auth = bearer(member.id);

    expect((await request(app).get('/terms').set('Authorization', auth)).status).toBe(200);
    expect((await request(app).get('/profile').set('Authorization', auth)).status).toBe(200);

    const res = await request(app).get('/active').set('Authorization', auth);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PROFILE_REQUIRED');
  });

  it('필수 약관 중 하나라도 최신 상태가 미동의면 TERMS_REQUIRED', async () => {
    const member = await createMember({ status: 'P', nickname: null });
    await agreeConsents(member.id);
    // 나중에 위치기반 동의를 철회한 기록
    await prisma.memberConsent.create({
      data: { userId: member.id, consentType: 'LOCATION', agreed: false, policyVersion: 'test' },
    });

    const res = await request(app).get('/profile').set('Authorization', bearer(member.id));

    expect(res.body.code).toBe('TERMS_REQUIRED');
  });

  it('활성 회원(A)은 모두 통과한다', async () => {
    const member = await createMember();
    const auth = bearer(member.id);

    for (const path of ['/terms', '/profile', '/active']) {
      const res = await request(app).get(path).set('Authorization', auth);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('A');
    }
  });
});
