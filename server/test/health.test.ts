import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

const app = createApp();

describe('GET /api/v1/health', () => {
  it('성공 응답 형식으로 status ok를 준다', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { status: 'ok' },
      message: '요청에 성공했습니다.',
    });
  });
});

describe('공통 에러 응답', () => {
  it('없는 경로는 COMMON_002', async () => {
    const res = await request(app).get('/api/v1/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      code: 'COMMON_002',
      message: '요청한 경로를 찾을 수 없습니다.',
    });
  });

  it('깨진 JSON은 COMMON_001', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{bad');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: 'COMMON_001' });
  });
});
