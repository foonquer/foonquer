import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/common/middlewares/error-handler';
import { rateLimit, resetRateLimits } from '../../src/common/middlewares/rate-limit';
import { ok } from '../../src/common/response';

const app = express();
app.get('/limited', rateLimit({ windowMs: 60_000, limit: 2 }), (_req, res) => {
  ok(res, null);
});
app.use(errorHandler);

beforeEach(async () => {
  await resetRateLimits();
});

describe('rateLimit()', () => {
  it('횟수를 넘으면 429 TOO_MANY_REQUESTS', async () => {
    expect((await request(app).get('/limited')).status).toBe(200);
    expect((await request(app).get('/limited')).status).toBe(200);

    const res = await request(app).get('/limited');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      success: false,
      code: 'TOO_MANY_REQUESTS',
      message: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
      data: null,
    });
  });

  it('resetRateLimits()로 기록을 지울 수 있다', async () => {
    await request(app).get('/limited');
    await request(app).get('/limited');
    await resetRateLimits();

    expect((await request(app).get('/limited')).status).toBe(200);
  });
});
