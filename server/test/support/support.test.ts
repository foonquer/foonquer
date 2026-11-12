import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POLICY_CONTACT_VERSION, POLICY_DRAFT_VERSION } from '../../prisma/policies';
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

    const badFaq = await request(app)
      .get('/api/v1/faqs?category=SHOP')
      .set('Authorization', bearer(me.id));
    expect(badFaq.status).toBe(400);
    expect(badFaq.body.code).toBe('INVALID_FAQ_CATEGORY');
    const hidden = await prisma.notice.create({
      data: { title: '내린 공지', content: '', status: 'H' },
    });
    const hiddenRes = await request(app)
      .get(`/api/v1/notices/${hidden.id}`)
      .set('Authorization', bearer(me.id));
    expect(hiddenRes.status).toBe(404);
    expect(hiddenRes.body.code).toBe('NOTICE_NOT_FOUND');
    expect((await request(app).get('/api/v1/notices')).status).toBe(401);
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
    expect(await prisma.inquiry.findUniqueOrThrow({ where: { id: BigInt(id) } })).toMatchObject({
      userId: me.id,
      refVisitId: visit.id,
      imageKey: key,
      status: 'W',
    });

    const send = (userId: bigint, body: object) =>
      request(app).post('/api/v1/inquiries').set('Authorization', bearer(userId)).send(body);
    const others = await send(other.id, {
      category: 'VISIT',
      content: '남의 인증',
      refVisitId: Number(visit.id),
    });
    expect(others.status).toBe(400);
    expect(others.body.code).toBe('INVALID_REF_VISIT');
    const cases: [object, string][] = [
      [{ category: 'SHOP', content: '내용' }, 'INVALID_INQUIRY_CATEGORY'],
      [{ category: 'ETC', content: '   ' }, 'INQUIRY_CONTENT_REQUIRED'],
      [{ category: 'ETC', content: '남의 사진', imageKey: key }, 'IMAGE_KEY_FORBIDDEN'],
    ];
    for (const [body, code] of cases) expect((await send(other.id, body)).body.code).toBe(code);
    // 실패한 요청은 문의를 남기지 않는다
    expect(await prisma.inquiry.count({ where: { userId: other.id } })).toBe(0);
    // 1분에 5번까지 (위에서 5번 보냄)
    expect((await send(other.id, { category: 'ETC', content: '여섯 번째' })).status).toBe(429);

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
    expect(res.body.data).toMatchObject({ type: 'TERMS', version: POLICY_DRAFT_VERSION });
    expect(res.body.data.content).toMatch(/^먹장깨기 서비스 이용약관\n\n제1조 \(목적\)/);
    expect(res.body.data.versions.map((v: { version: string }) => v.version)).toEqual([
      POLICY_DRAFT_VERSION,
      '2026-09-01',
    ]);
    // 지난 버전(자리표시)도 볼 수 있다
    const first = await request(app).get('/api/v1/terms/PRIVACY?version=2026-09-01');
    expect(first.body.data.content).toContain('본문은 준비 중입니다.');
    const privacy = await request(app).get('/api/v1/terms/PRIVACY');
    expect(privacy.body.data.content).toContain('네이버클라우드㈜ (CLOVA OCR)');
    const location = await request(app).get('/api/v1/terms/LOCATION');
    expect(location.body.data.content).toMatch(/^먹장깨기 위치기반 서비스 이용약관/);
    // 처리방침·위치 약관은 책임자 이메일을 더한 2026-11-13 버전이 최신이고, 2026-11-12 본문은 그대로다
    const emails = '이메일: skyjsy0331@gmail.com, rachelwl321@gmail.com, anjun0423@gmail.com';
    for (const doc of [privacy.body.data, location.body.data]) {
      expect(doc.version).toBe(POLICY_CONTACT_VERSION);
      expect(doc.content).toContain(emails);
      expect(doc.content).toContain('2026년 11월 13일부터 시행');
      expect(doc.content).not.toMatch(/010-?\d{4}/);
    }
    const before = await request(app).get(`/api/v1/terms/PRIVACY?version=${POLICY_DRAFT_VERSION}`);
    expect(before.body.data.content).not.toContain(emails);
    expect(before.body.data.content).toContain('2026년 11월 12일부터 시행');
    expect((await request(app).get('/api/v1/terms/TERMS?version=1999')).body.code).toBe(
      'TERMS_NOT_FOUND',
    );
    expect((await request(app).get('/api/v1/terms/NOPE')).body.code).toBe('TERMS_NOT_FOUND');
  });
});
