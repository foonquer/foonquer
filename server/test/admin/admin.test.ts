import request from 'supertest';
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { resetDb, waitForRunningQueries } from '../helpers/db';
import {
  bearer,
  createActiveSeason,
  createMember,
  createRestaurant,
  createVisit,
} from '../helpers/fixtures';

const app = createApp();
const as = (userId: bigint) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set('Authorization', bearer(userId)),
  post: (path: string, body: object = {}) =>
    request(app).post(`/api/v1${path}`).set('Authorization', bearer(userId)).send(body),
  patch: (path: string, body: object = {}) =>
    request(app).patch(`/api/v1${path}`).set('Authorization', bearer(userId)).send(body),
});

beforeEach(async () => {
  await resetDb();
});

const createAdmin = () => createMember({ role: 'A' });

async function createReview(userId: bigint, restaurantId: bigint, content = '맛있어요') {
  const season = await prisma.season.findFirst({ where: { status: 'A' } });
  const visit = await createVisit(userId, restaurantId, { seasonId: season?.id ?? null });
  return prisma.review.create({
    data: { visitId: visit.id, userId, restaurantId, overallScore: 4.5, content },
  });
}

const trustOf = async (userId: bigint) =>
  (await prisma.member.findUniqueOrThrow({ where: { id: userId } })).trustTemp.toNumber();

describe('ADMIN 관리자 API', () => {
  it('운영자(role A)만 쓸 수 있다', async () => {
    const user = await createMember();
    expect((await request(app).get('/api/v1/admin/reports')).status).toBe(401);
    const res = await as(user.id).get('/admin/reports');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect((await as((await createAdmin()).id).get('/admin/reports')).status).toBe(200);
  });

  it('리뷰 신고 → 블라인드(온도 −3°, 같은 리뷰 신고 함께 처리, 별점 다시 계산), 다시 처리하면 409', async () => {
    await createActiveSeason(3);
    const admin = await createAdmin();
    const [author, r1, r2] = await Promise.all([createMember(), createMember(), createMember()]);
    const shop = await createRestaurant();
    const review = await createReview(author.id, shop.id);
    await prisma.restaurantStat.upsert({
      where: { restaurantId: shop.id },
      update: { reviewCount: 1 },
      create: { restaurantId: shop.id, reviewCount: 1 },
    });
    for (const r of [r1, r2]) {
      expect(
        (
          await as(r.id).post('/reports', {
            targetType: 'REVIEW',
            targetId: Number(review.id),
            reason: 'FAKE',
          })
        ).status,
      ).toBe(201);
    }

    const list = await as(admin.id).get('/admin/reports?targetType=REVIEW');
    expect(list.body.data.totalCount).toBe(2);
    const first = list.body.data.items[0];
    expect(first).toMatchObject({
      targetType: 'REVIEW',
      status: 'PENDING',
      pendingCount: 2,
      review: { content: '맛있어요', author: { userId: Number(author.id) } },
    });

    const wrong = await as(admin.id).patch(`/admin/reports/${first.reportId}`, {
      action: 'SUSPEND_MEMBER',
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('INVALID_REPORT_ACTION');

    const done = await as(admin.id).patch(`/admin/reports/${first.reportId}`, {
      action: 'HIDE_REVIEW',
    });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'DONE', closedCount: 2 });
    expect((await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).status).toBe('H');
    expect(await trustOf(author.id)).toBe(47);
    expect(
      (await prisma.restaurantStat.findUniqueOrThrow({ where: { restaurantId: shop.id } }))
        .reviewCount,
    ).toBe(0);
    expect(await prisma.report.count({ where: { status: 'P' } })).toBe(0);

    const again = await as(admin.id).patch(`/admin/reports/${first.reportId}`, {
      action: 'HIDE_REVIEW',
    });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('REPORT_ALREADY_PROCESSED');
    expect(
      (await as(admin.id).get('/admin/reports?status=DONE')).body.data.items.map(
        (i: { status: string }) => i.status,
      ),
    ).toEqual(['DONE', 'DONE']);
  });

  it('같은 리뷰의 신고 두 건을 동시에 처리해도 한 번만 처리하고 온도도 한 번만 내린다', async () => {
    await createActiveSeason(3);
    const admin = await createAdmin();
    const [author, r1, r2] = await Promise.all([createMember(), createMember(), createMember()]);
    const review = await createReview(author.id, (await createRestaurant()).id);
    const reports = await Promise.all(
      [r1, r2].map((r) =>
        prisma.report.create({
          data: { reporterId: r.id, targetType: 'R', targetId: review.id, reason: 'ABUSE' },
        }),
      ),
    );
    // 신고 행을 잠가 두고 두 처리를 보낸 뒤, 둘 다 같은 대상 신고를 잠그려는 것을 확인하고 풀어서 경합시킨다
    let processing: Promise<request.Response[]> = Promise.resolve([]);
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM report WHERE target_id = ${review.id} FOR UPDATE`;
        processing = Promise.all(
          reports.map(async (r) =>
            as(admin.id).patch(`/admin/reports/${r.id}`, { action: 'HIDE_REVIEW' }),
          ),
        );
        await waitForRunningQueries('SELECT id, status FROM report WHERE target_type', 2);
      },
      { timeout: 10_000 },
    );
    const results = await processing;
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await trustOf(author.id)).toBe(47);
    expect(await prisma.report.count({ where: { status: 'A' } })).toBe(2);
  });

  it('리뷰 허위 판정은 온도 −5°(리뷰당 한 번), 되돌려도 온도는 그대로, 반려는 그 신고만', async () => {
    await createActiveSeason(3);
    const admin = await createAdmin();
    const [author, reporter] = await Promise.all([createMember(), createMember()]);
    const shop = await createRestaurant({ name: '협찬집' });
    const review = await createReview(author.id, shop.id, '사장님이 서비스 주셨어요');
    await prisma.review.update({ where: { id: review.id }, data: { adSuspected: true } });

    const suspected = await as(admin.id).get('/admin/reviews?adSuspected=true');
    expect(suspected.body.data.items).toEqual([
      expect.objectContaining({
        reviewId: Number(review.id),
        status: 'VISIBLE',
        restaurant: expect.objectContaining({ name: '협찬집', hasMapae: false }),
      }),
    ]);

    for (const status of ['FAKE', 'FAKE'] as const) {
      const res = await as(admin.id).patch(`/admin/reviews/${review.id}/status`, { status });
      expect(res.body.data.status).toBe('FAKE');
    }
    expect(await trustOf(author.id)).toBe(45);
    await as(admin.id).patch(`/admin/reviews/${review.id}/status`, { status: 'VISIBLE' });
    expect((await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).status).toBe('A');
    expect(await trustOf(author.id)).toBe(45);

    const reported = await as(reporter.id).post('/reports', {
      targetType: 'REVIEW',
      targetId: Number(review.id),
      reason: 'AD',
    });
    // 같은 리뷰에 신고가 하나 더 있어도 반려는 고른 신고만
    const second = await prisma.report.create({
      data: {
        reporterId: (await createMember()).id,
        targetType: 'R',
        targetId: review.id,
        reason: 'SPAM',
      },
    });
    const rejected = await as(admin.id).patch(`/admin/reports/${reported.body.data.reportId}`, {
      action: 'REJECT',
    });
    expect(rejected.body.data).toMatchObject({ status: 'REJECTED', closedCount: 1 });
    expect((await prisma.report.findUniqueOrThrow({ where: { id: second.id } })).status).toBe('P');
    expect((await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).status).toBe('A');

    await prisma.review.update({ where: { id: review.id }, data: { status: 'D' } });
    const deleted = await as(admin.id).patch(`/admin/reviews/${review.id}/status`, {
      status: 'HIDDEN',
    });
    expect(deleted.status).toBe(409);
    expect(deleted.body.code).toBe('INVALID_REVIEW_STATUS');
    expect((await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).status).toBe('D');
    const missing = await as(admin.id).patch('/admin/reviews/999999/status', { status: 'HIDDEN' });
    expect([missing.status, missing.body.code]).toEqual([404, 'REVIEW_NOT_FOUND']);
  });

  it('회원 신고 → 이용 정지(모든 API 403), 찾기, 정지 해제, 내 계정은 정지 못 함', async () => {
    const admin = await createAdmin();
    const [bad, reporter] = await Promise.all([
      createMember({ nickname: '나쁜탐험가' }),
      createMember(),
    ]);
    const reported = await as(reporter.id).post('/reports', {
      targetType: 'MEMBER',
      targetId: Number(bad.id),
      reason: 'ABUSE',
    });
    const done = await as(admin.id).patch(`/admin/reports/${reported.body.data.reportId}`, {
      action: 'SUSPEND_MEMBER',
    });
    expect(done.body.data).toMatchObject({ status: 'DONE', closedCount: 1 });
    expect(await trustOf(bad.id)).toBe(47);
    const blocked = await as(bad.id).get('/users/me');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('MEMBER_SUSPENDED');

    const found = await as(admin.id).get(`/admin/members?nickname=${encodeURIComponent('나쁜')}`);
    expect(found.body.data.items).toEqual([
      expect.objectContaining({ userId: Number(bad.id), status: 'SUSPENDED', role: 'USER' }),
    ]);

    const lifted = await as(admin.id).patch(`/admin/members/${bad.id}/status`, {
      status: 'ACTIVE',
    });
    expect(lifted.body.message).toBe('이용 정지를 풀었어요.');
    expect((await as(bad.id).get('/users/me')).status).toBe(200);
    const self = await as(admin.id).patch(`/admin/members/${admin.id}/status`, {
      status: 'SUSPENDED',
    });
    expect([self.status, self.body.code]).toEqual([400, 'CANNOT_SUSPEND_SELF']);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: admin.id } })).status).toBe('A');
    const pending = await createMember({ status: 'P', nickname: null });
    const invalid = await as(admin.id).patch(`/admin/members/${pending.id}/status`, {
      status: 'SUSPENDED',
    });
    expect(invalid.status).toBe(409);
    expect(invalid.body.code).toBe('INVALID_MEMBER_STATUS');
    expect((await prisma.member.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('P');
  });

  it('마패 붙이기(가게 has_mapae) → 같은 가게 또 붙이면 409 → 해제 → 다시 해제하면 409', async () => {
    const admin = await createAdmin();
    const shop = await createRestaurant();
    const granted = await as(admin.id).post('/admin/mapae', {
      restaurantId: Number(shop.id),
      reason: 'EVENT',
      evidence: '리뷰 쓰면 음료 서비스 안내문',
    });
    expect(granted.status).toBe(201);
    expect((await prisma.restaurant.findUniqueOrThrow({ where: { id: shop.id } })).hasMapae).toBe(
      true,
    );
    const mapae = await prisma.restaurantMapae.findFirstOrThrow({
      where: { restaurantId: shop.id },
    });
    expect(mapae).toMatchObject({ reason: 'E', status: 'A', grantedBy: `member:${admin.id}` });
    const dup = await as(admin.id).post('/admin/mapae', {
      restaurantId: Number(shop.id),
      reason: 'AD',
    });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('MAPAE_ALREADY_ACTIVE');
    expect(await prisma.restaurantMapae.count()).toBe(1);
    const noShop = await as(admin.id).post('/admin/mapae', { restaurantId: 999999, reason: 'AD' });
    expect([noShop.status, noShop.body.code]).toEqual([404, 'RESTAURANT_NOT_FOUND']);
    expect(await prisma.restaurantMapae.count()).toBe(1);

    const list = await as(admin.id).get('/admin/mapae');
    expect(list.body.data.items).toEqual([
      expect.objectContaining({ mapaeId: Number(mapae.id), reason: 'EVENT', status: 'ACTIVE' }),
    ]);

    const released = await as(admin.id).patch(`/admin/mapae/${mapae.id}/release`, {
      releaseReason: '이벤트 종료',
    });
    expect(released.body.data.status).toBe('RELEASED');
    expect((await prisma.restaurant.findUniqueOrThrow({ where: { id: shop.id } })).hasMapae).toBe(
      false,
    );
    const again = await as(admin.id).patch(`/admin/mapae/${mapae.id}/release`, {
      releaseReason: '이벤트 종료',
    });
    expect([again.status, again.body.code]).toEqual([409, 'MAPAE_ALREADY_RELEASED']);
    expect(
      (await prisma.restaurantMapae.findUniqueOrThrow({ where: { id: mapae.id } })).status,
    ).toBe('R');
    expect((await prisma.restaurant.findUniqueOrThrow({ where: { id: shop.id } })).hasMapae).toBe(
      false,
    );
  });

  it('1:1 문의 답변 → 답변 완료 + 알림(처음 한 번), 고쳐 쓸 수 있다', async () => {
    const admin = await createAdmin();
    const me = await createMember();
    const created = await as(me.id).post('/inquiries', {
      category: 'VISIT',
      content: '영수증 인증이 안 돼요',
    });
    const id = created.body.data.inquiryId as number;
    const waiting = await as(admin.id).get('/admin/inquiries');
    expect(waiting.body.data.items).toEqual([
      expect.objectContaining({
        inquiryId: id,
        status: 'WAITING',
        content: '영수증 인증이 안 돼요',
      }),
    ]);

    const answered = await as(admin.id).patch(`/admin/inquiries/${id}/answer`, {
      answer: '확인해서 인증 처리했어요.',
    });
    expect(answered.body.data).toMatchObject({ status: 'ANSWERED', notified: true });
    const fixed = await as(admin.id).patch(`/admin/inquiries/${id}/answer`, {
      answer: '확인해서 인증 처리했어요. 불편을 드려 죄송해요.',
    });
    expect(fixed.body.data.notified).toBe(false);

    const mine = await as(me.id).get(`/inquiries/${id}`);
    expect(mine.body.data).toMatchObject({
      status: 'ANSWERED',
      answer: '확인해서 인증 처리했어요. 불편을 드려 죄송해요.',
    });
    const notes = await as(me.id).get('/notifications');
    expect(notes.body.data.items).toEqual([
      expect.objectContaining({
        type: 'INQUIRY_ANSWER',
        title: '1:1 문의에 답변이 왔어요',
        deepLink: `/support?inquiryId=${id}`,
      }),
    ]);
    expect((await as(admin.id).get('/admin/inquiries')).body.data.totalCount).toBe(0);
    expect(
      (await as(admin.id).patch('/admin/inquiries/999999/answer', { answer: '답' })).status,
    ).toBe(404);
  });

  it('공지·FAQ 등록·수정·숨기기, 약관 새 버전(같은 버전은 409)', async () => {
    const admin = await createAdmin();
    const user = await createMember();
    const notice = await as(admin.id).post('/admin/notices', {
      title: '시즌 4 안내',
      content: '시즌 4가 시작돼요',
      tag: '필독',
      isPinned: true,
    });
    expect(notice.body.data).toMatchObject({ title: '시즌 4 안내', status: 'VISIBLE' });
    const noticeId = notice.body.data.noticeId as number;
    expect((await as(user.id).get('/notices')).body.data.items[0]).toMatchObject({
      noticeId,
      isPinned: true,
    });
    await as(admin.id).patch(`/admin/notices/${noticeId}`, { status: 'HIDDEN' });
    expect((await as(user.id).get(`/notices/${noticeId}`)).status).toBe(404);
    expect((await as(admin.id).patch(`/admin/notices/${noticeId}`, {})).body.code).toBe(
      'NO_FIELDS_TO_UPDATE',
    );
    expect((await as(admin.id).patch('/admin/notices/999999', { title: '없음' })).status).toBe(404);

    const faq = await as(admin.id).post('/admin/faqs', {
      category: 'POINT',
      question: '먹포인트는 어디에 쓰나요?',
      answer: '상점에서 먹깨비 아이템을 살 수 있어요.',
    });
    const faqId = faq.body.data.faqId as number;
    await as(admin.id).patch(`/admin/faqs/${faqId}`, { answer: '상점에서 모자·얼굴·소품을 사요.' });
    expect((await as(user.id).get('/faqs?category=POINT')).body.data.items).toEqual([
      expect.objectContaining({ faqId, answer: '상점에서 모자·얼굴·소품을 사요.' }),
    ]);
    expect(
      (await as(admin.id).post('/admin/faqs', { ...faq.body.data, category: 'ETC' })).body.code,
    ).toBe('INVALID_FAQ_CATEGORY');

    // policy_document는 resetDb가 비우지 않는 기본 데이터라, 지금 시행 중인 약관이 바뀌지 않게 먼 미래 시행일로 넣고 지운다
    const doc = {
      type: 'PRIVACY',
      version: 'test-admin',
      content: '탈퇴하면 방문 사진·결제 정보를 바로 지워요.',
      effectiveDate: '2099-01-01',
    };
    onTestFinished(async () => {
      await prisma.policyDocument.deleteMany({ where: { version: doc.version } });
    });
    const created = await as(admin.id).post('/admin/policy-documents', doc);
    expect(created.body.data).toMatchObject({
      type: 'PRIVACY',
      version: 'test-admin',
      effectiveDate: '2099-01-01',
    });
    expect(
      (await request(app).get('/api/v1/terms/PRIVACY?version=test-admin')).body.data.content,
    ).toBe(doc.content);
    const dup = await as(admin.id).post('/admin/policy-documents', doc);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('POLICY_VERSION_EXISTS');
    expect(
      (await as(admin.id).post('/admin/policy-documents', { ...doc, effectiveDate: '2026-02-30' }))
        .status,
    ).toBe(400);
  });

  it('없는 대상·잘못된 처리·다른 가게 리뷰는 거절하고, 일반 회원의 쓰기 요청은 403이며 DB는 그대로', async () => {
    await createActiveSeason(3);
    const admin = await createAdmin();
    const [user, author] = await Promise.all([createMember(), createMember()]);
    const [shop, other] = await Promise.all([createRestaurant(), createRestaurant()]);
    const review = await createReview(author.id, other.id);
    const report = await prisma.report.create({
      data: { reporterId: user.id, targetType: 'R', targetId: review.id, reason: 'SPAM' },
    });

    const cases: [Promise<request.Response>, number, string][] = [
      [as(admin.id).patch('/admin/reports/999999', { action: 'REJECT' }), 404, 'REPORT_NOT_FOUND'],
      [
        as(admin.id).patch(`/admin/reports/${report.id}`, { action: 'DELETE' }),
        400,
        'INVALID_REPORT_ACTION',
      ],
      [
        as(admin.id).patch('/admin/mapae/999999/release', { releaseReason: '종료' }),
        404,
        'MAPAE_NOT_FOUND',
      ],
      [as(admin.id).patch('/admin/faqs/999999', { question: '없음' }), 404, 'FAQ_NOT_FOUND'],
      [
        as(admin.id).post('/admin/mapae', {
          restaurantId: Number(shop.id),
          reason: 'AD',
          reviewId: Number(review.id),
        }),
        404,
        'REVIEW_NOT_FOUND',
      ],
      [as(user.id).post('/admin/notices', { title: '공지', content: '내용' }), 403, 'FORBIDDEN'],
      [
        as(user.id).patch(`/admin/reports/${report.id}`, { action: 'HIDE_REVIEW' }),
        403,
        'FORBIDDEN',
      ],
      [
        as(user.id).patch(`/admin/members/${author.id}/status`, { status: 'SUSPENDED' }),
        403,
        'FORBIDDEN',
      ],
    ];
    for (const [call, status, code] of cases) {
      const res = await call;
      expect([res.status, res.body.code]).toEqual([status, code]);
    }
    expect(await prisma.restaurantMapae.count()).toBe(0);
    expect((await prisma.restaurant.findUniqueOrThrow({ where: { id: shop.id } })).hasMapae).toBe(
      false,
    );
    expect(await prisma.notice.count()).toBe(0);
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('P');
    expect((await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).status).toBe('A');
    expect((await prisma.member.findUniqueOrThrow({ where: { id: author.id } })).status).toBe('A');
  });

  it('이용 정지와 탈퇴가 겹쳐도 탈퇴한 회원을 정지로 덮어쓰지 않는다 (회원 행을 잠그고 읽는다)', async () => {
    const admin = await createAdmin();
    const target = await createMember();
    // 탈퇴 트랜잭션처럼 회원 행을 잠근 채 정지 요청을 보내고, 정지가 회원 행 잠금을 기다리는 것을 확인한 뒤 탈퇴로 바꾼다
    let suspending: Promise<request.Response> = Promise.resolve({} as request.Response);
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM member WHERE id = ${target.id} FOR UPDATE`;
        suspending = Promise.resolve(
          as(admin.id).patch(`/admin/members/${target.id}/status`, { status: 'SUSPENDED' }),
        );
        await waitForRunningQueries('SELECT status FROM member WHERE id');
        await tx.member.update({ where: { id: target.id }, data: { status: 'D' } });
      },
      { timeout: 10_000 },
    );
    const res = await suspending;
    expect([res.status, res.body.code]).toEqual([409, 'INVALID_MEMBER_STATUS']);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: target.id } })).status).toBe('D');
  });
});
