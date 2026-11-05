import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import * as storage from '../../src/lib/storage';
import { resetDb } from '../helpers/db';
import { bearer, createMember, createRestaurant, createVisit } from '../helpers/fixtures';
import { resetStorageMock } from '../helpers/storage-mock';

vi.mock('../../src/lib/storage', async () =>
  (await import('../helpers/storage-mock.js')).storageMock(),
);

const app = createApp();

beforeEach(async () => {
  await resetDb();
  resetStorageMock(storage);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CS 공지·FAQ·문의·약관', () => {
  it('공지(필독 먼저)·상세, FAQ 유형별', async () => {
    const me = await createMember();
    await prisma.notice.create({ data: { title: '일반 공지', content: '본문' } });
    const pinned = await prisma.notice.create({
      data: { title: '필독', content: '꼭 읽어 주세요', isPinned: true, tag: '필독' },
    });
    await prisma.faq.createMany({
      data: [
        { category: 'VISIT', question: 'Q. 영수증 인증이 계속 실패해요', answer: 'A' },
        { category: 'POINT', question: 'Q. 먹포인트는 어떻게 모으나요?', answer: 'B' },
      ],
    });
    const list = await request(app).get('/api/v1/notices').set('Authorization', bearer(me.id));
    expect(list.body.data.items.map((n: { title: string }) => n.title)).toEqual([
      '필독',
      '일반 공지',
    ]);
    const detail = await request(app)
      .get(`/api/v1/notices/${pinned.id}`)
      .set('Authorization', bearer(me.id));
    expect(detail.body.data.content).toBe('꼭 읽어 주세요');
    const faqs = await request(app)
      .get('/api/v1/faqs?category=VISIT')
      .set('Authorization', bearer(me.id));
    expect(faqs.body.data.items).toHaveLength(1);
  });

  it('1:1 문의 등록(내 방문 인증·사진 1장)·목록·상세(signed URL)', async () => {
    const me = await createMember();
    const other = await createMember();
    const visit = await createVisit(me.id, (await createRestaurant({ name: '새맛집' })).id, {
      status: 'F',
    });
    const key = `inquiry/${me.id}/${randomUUID()}.jpg`;
    const created = await request(app)
      .post('/api/v1/inquiries')
      .set('Authorization', bearer(me.id))
      .send({
        category: 'VISIT',
        content: '가게 정보가 달라요가 나와요.',
        refVisitId: Number(visit.id),
        imageKey: key,
      });
    expect(created.status).toBe(201);
    const id = created.body.data.inquiryId as number;

    const others = await request(app)
      .post('/api/v1/inquiries')
      .set('Authorization', bearer(other.id))
      .send({ category: 'VISIT', content: '남의 인증', refVisitId: Number(visit.id) });
    expect(others.body.code).toBe('INVALID_REF_VISIT');

    const list = await request(app).get('/api/v1/inquiries/me').set('Authorization', bearer(me.id));
    expect(list.body.data.items[0]).toMatchObject({ inquiryId: id, status: 'WAITING' });
    const detail = await request(app)
      .get(`/api/v1/inquiries/${id}`)
      .set('Authorization', bearer(me.id));
    expect(detail.body.data).toMatchObject({
      refVisit: { restaurantName: '새맛집' },
      imageUrl: `https://signed.test/${key}`,
    });
    expect(
      (await request(app).get(`/api/v1/inquiries/${id}`).set('Authorization', bearer(other.id)))
        .status,
    ).toBe(404);
  });

  it('약관은 로그인 없이 최신(또는 지정) 버전', async () => {
    const res = await request(app).get('/api/v1/terms/TERMS');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ type: 'TERMS', version: '2026-09-01' });
    expect(res.body.data.versions).toHaveLength(1);
    expect((await request(app).get('/api/v1/terms/TERMS?version=1999')).body.code).toBe(
      'TERMS_NOT_FOUND',
    );
    expect((await request(app).get('/api/v1/terms/NOPE')).body.code).toBe('TERMS_NOT_FOUND');
  });
});
