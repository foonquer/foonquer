import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { addDays } from '../../src/common/time';
import {
  FILE_SWEEP_BATCH,
  runCleanupJob,
  runRatingJob,
  runSavedReminderJob,
} from '../../src/jobs/jobs';
import { prisma } from '../../src/lib/prisma';
import { deleteObjectQuietly, deletePrefixQuietly, listObjects } from '../../src/lib/storage';
import { notify } from '../../src/modules/notification/notify';
import { resetDb } from '../helpers/db';
import {
  createActiveSeason,
  createConquest,
  createMember,
  createRestaurant,
  createVisit,
} from '../helpers/fixtures';

vi.mock('../../src/lib/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/storage')>()),
  deletePrefixQuietly: vi.fn(() => Promise.resolve(true)),
  listObjects: vi.fn(() => Promise.resolve([])),
  deleteObjectQuietly: vi.fn(() => Promise.resolve()),
}));

beforeEach(async () => {
  await resetDb();
  vi.mocked(deletePrefixQuietly).mockClear();
  vi.mocked(listObjects).mockReset().mockResolvedValue([]);
  vi.mocked(deleteObjectQuietly).mockClear();
});

describe('주기 작업', () => {
  it('saved-reminder: 12일 지난 저장(알림 켬, 미정복)만 한 번 알린다', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    const [due, off, conquered, fresh] = await Promise.all(
      [1, 2, 3, 4].map(() => createRestaurant()),
    );
    const old = addDays(new Date(), -13);
    await prisma.savedRestaurant.createMany({
      data: [
        { userId: me.id, restaurantId: due.id, regDate: old },
        { userId: me.id, restaurantId: off.id, regDate: old, remind: false },
        { userId: me.id, restaurantId: conquered.id, regDate: old },
        { userId: me.id, restaurantId: fresh.id },
      ],
    });
    await createConquest(me.id, conquered, season.id);
    expect(await runSavedReminderJob()).toEqual({ checked: 2, sent: 1 });
    expect(await runSavedReminderJob()).toEqual({ checked: 0, sent: 0 });
    expect(
      await prisma.notification.count({ where: { userId: me.id, type: 'SAVED_REMINDER' } }),
    ).toBe(1);
    const note = await prisma.notification.findFirstOrThrow({
      where: { userId: me.id, type: 'SAVED_REMINDER' },
    });
    expect(note.refId).toBe(due.id);
  });

  it('saved-reminder: 두 작업이 겹쳐 돌아도 알림은 한 번만', async () => {
    const me = await createMember();
    const shop = await createRestaurant();
    await prisma.savedRestaurant.create({
      data: { userId: me.id, restaurantId: shop.id, regDate: addDays(new Date(), -13) },
    });
    const [a, b] = await Promise.all([runSavedReminderJob(), runSavedReminderJob()]);
    expect(a.sent + b.sent).toBe(1);
    expect(await prisma.notification.count({ where: { userId: me.id } })).toBe(1);
  });

  it('cleanup: 30일 지난 알림, 만료된 토큰을 지운다', async () => {
    const me = await createMember();
    await notify(
      prisma,
      me.id,
      { category: 'NOTICE', type: 'NOTICE', title: '옛', content: '' },
      addDays(new Date(), -31),
    );
    await notify(prisma, me.id, { category: 'NOTICE', type: 'NOTICE', title: '새', content: '' });
    const twoDaysAgo = addDays(new Date(), -2);
    const later = addDays(new Date(), 7);
    await prisma.refreshToken.createMany({
      data: [
        { userId: me.id, tokenHash: 'a'.repeat(64), expiresAt: twoDaysAgo },
        { userId: me.id, tokenHash: 'b'.repeat(64), expiresAt: later, revokedAt: twoDaysAgo },
        { userId: me.id, tokenHash: 'c'.repeat(64), expiresAt: later },
      ],
    });
    await prisma.authTemporaryToken.createMany({
      data: [
        {
          tokenHash: 'd'.repeat(64),
          tokenType: 'OAUTH_RESULT',
          payload: {},
          expiresAt: twoDaysAgo,
        },
        { tokenHash: 'e'.repeat(64), tokenType: 'OAUTH_RESULT', payload: {}, expiresAt: later },
      ],
    });

    expect(await runCleanupJob()).toEqual({
      notifications: 1,
      refreshTokens: 2,
      temporaryTokens: 1,
      withdrawnFileMembers: 0,
      orphanUploads: 0,
      failed: 0,
    });
    const left = await prisma.notification.findMany({ where: { userId: me.id } });
    expect(left.map((n) => n.title)).toEqual(['새']);
    expect((await prisma.refreshToken.findMany()).map((t) => t.tokenHash)).toEqual([
      'c'.repeat(64),
    ]);
    expect((await prisma.authTemporaryToken.findMany()).map((t) => t.tokenHash)).toEqual([
      'e'.repeat(64),
    ]);
  });

  /** 리뷰 하나 (리뷰마다 다른 회원이 인증한 방문) */
  async function writeReview(
    restaurantId: bigint,
    overallScore: number,
    regDate = new Date(),
    userId?: bigint,
  ) {
    const season =
      (await prisma.season.findFirst({ where: { status: 'A' } })) ?? (await createActiveSeason(3));
    const writer = userId ?? (await createMember()).id;
    const visit = await createVisit(writer, restaurantId, { seasonId: season.id });
    return prisma.review.create({
      data: { visitId: visit.id, userId: writer, restaurantId, overallScore, regDate },
    });
  }

  it('rating: 최근 6개월 평균이 그 전과 확실히 달라진 가게만 옛 리뷰를 덜 반영한다', async () => {
    const shop = await createRestaurant();
    const old = addDays(new Date(), -400);
    for (const score of [1, 1.5, 1, 1.5, 1]) await writeReview(shop.id, score, old);
    for (const score of [5, 4.5, 5, 4.5, 5]) await writeReview(shop.id, score);
    expect(await runRatingJob()).toMatchObject({ restaurants: 1, reviewCount: 10, failed: 0 });
    const stat = await prisma.restaurantStat.findUniqueOrThrow({
      where: { restaurantId: shop.id },
    });
    // 옛 평균 1.2 → 최근 4.8 (차이 3.6, 강도 2): 1년 넘은 리뷰 d = max(0.3, 0.7^(2 × 2)) = 0.3
    // Σw = 5 × 0.3 + 5 = 6.5, Σwr = 0.3 × 6 + 24 = 25.8, m = 3.5 (다른 가게 리뷰 없음)
    // R = (5 × 3.5 + 25.8) ÷ (5 + 6.5) ≈ 3.8 (감쇠가 없으면 3.2)
    expect(stat.weightSum.toNumber()).toBe(6.5);
    expect(stat.displayScore?.toNumber()).toBe(3.8);
    expect(stat.scoreSum.toNumber()).toBe(30);
  });

  it('rating: 리뷰가 적어 변화를 판정할 수 없으면 옛 리뷰도 그대로 반영한다', async () => {
    const shop = await createRestaurant();
    await writeReview(shop.id, 1, addDays(new Date(), -400));
    await writeReview(shop.id, 5);
    await runRatingJob();
    const stat = await prisma.restaurantStat.findUniqueOrThrow({
      where: { restaurantId: shop.id },
    });
    // R = (5 × 3.5 + 1 + 5) ÷ (5 + 2) ≈ 3.4
    expect(stat.weightSum.toNumber()).toBe(2);
    expect(stat.displayScore?.toNumber()).toBe(3.4);
  });

  it('rating: 동네 평균 m은 같은 동·구의 다른 가게 리뷰로 정한다', async () => {
    const shop = await createRestaurant();
    const neighbor = await createRestaurant();
    for (let i = 0; i < 10; i += 1) await writeReview(neighbor.id, 4.5);
    await writeReview(shop.id, 4);
    await runRatingJob();
    const stat = await prisma.restaurantStat.findUniqueOrThrow({
      where: { restaurantId: shop.id },
    });
    // 서울·구·동 모두 옆 가게 10개(평균 4.5)뿐: m_서울 = (45 + 30 × 3.5) ÷ 40 = 3.75,
    // m_구 = (45 + 30 × 3.75) ÷ 40 = 3.9375, m_동 = (45 + 30 × 3.9375) ÷ 40 ≈ 4.08
    // R = (5 × 4.08 + 4) ÷ 6 ≈ 4.1
    expect(stat.displayScore?.toNumber()).toBe(4.1);
  });

  it('rating: 지난주 새 리뷰를 쓴 사람 중 리뷰 10개 이상이고 어긋남이 보통의 2배를 넘으면 온도를 깎는다 (주 1번)', async () => {
    const now = new Date('2026-11-13T03:00:00Z'); // 금요일 12시 (KST), 지난주 = 11/2(월)~11/8(일)
    const before = new Date('2026-10-01T03:00:00Z');
    const lastWeek = new Date('2026-11-05T03:00:00Z');
    const shops = [];
    for (let i = 0; i < 10; i += 1) {
      const shop = await createRestaurant();
      await prisma.restaurantStat.create({ data: { restaurantId: shop.id, displayScore: 4 } });
      shops.push(shop);
    }
    // 가짜: 신뢰 별점 4점인 가게 10곳에 1점 (e = 3), 그중 하나를 지난주에 썼다
    const fake = await createMember();
    let lastWeekReviewId = 0n;
    for (const [i, shop] of shops.entries()) {
      const review = await writeReview(shop.id, 1, i === 0 ? lastWeek : before, fake.id);
      if (i === 0) lastWeekReviewId = review.id;
    }
    // 보통 사람 4명: 2곳에 4.5점 (e = 0.5) → ē = (3 + 0.5 × 4) ÷ 5 = 1
    const honest = [];
    for (let i = 0; i < 4; i += 1) {
      const member = await createMember();
      for (const shop of shops.slice(0, 2)) await writeReview(shop.id, 4.5, before, member.id);
      honest.push(member);
    }
    const idle = await createMember({ consistencyWeight: 0.8 }); // 공개 리뷰가 없어진 사람

    expect(await runRatingJob(now)).toMatchObject({ reviewers: 5, penalized: 1, failed: 0 });
    // 감점 = 32 × 10 ÷ 13 × (3 − 2 × 1) ÷ 1 × 새 리뷰 1개 ≈ 24.62°
    const after = await prisma.member.findUniqueOrThrow({ where: { id: fake.id } });
    expect(after.trustTemp.toNumber()).toBe(25.38);
    // 일관성 가중치: 가짜 clamp(1 + 0.3 × (1 − 3) ÷ 1) = 0.7, 보통 사람 1 + 0.3 × 0.5 = 1.15
    expect(after.consistencyWeight.toNumber()).toBe(0.7);
    const members = await prisma.member.findMany({
      where: { id: { in: [...honest.map((m) => m.id), idle.id] } },
      orderBy: { id: 'asc' },
    });
    expect(members.map((m) => [m.trustTemp.toNumber(), m.consistencyWeight.toNumber()])).toEqual([
      [50, 1.15],
      [50, 1.15],
      [50, 1.15],
      [50, 1.15],
      [50, 1],
    ]);
    // 가짜 리뷰 가중치 = clamp(1 + (25.38 − 50) ÷ 50) × 0.7 ≈ 0.355
    const weight = await prisma.review.findUniqueOrThrow({ where: { id: lastWeekReviewId } });
    expect(weight.scoreWeight.toNumber()).toBe(0.355);

    // 같은 주에 다시 돌아도 한 번만 깎는다
    await runRatingJob(addDays(now, 1));
    expect(
      await prisma.trustTempLog.findMany({
        where: { userId: fake.id, reason: 'CONSENSUS_GAP' },
        select: { refId: true, appliedDelta: true },
      }),
    ).toEqual([{ refId: lastWeekReviewId, appliedDelta: expect.anything() }]);
  });

  it('cleanup: 사진 삭제가 끝나지 않은 탈퇴 회원(files_purged_at 없음)의 폴더를 다 지울 때까지 다시 지운다', async () => {
    // 다시 지우는 순서가 id 순이라 left → failing 순서로 만든다 (Promise.all이면 id 순서가 정해지지 않는다)
    const left = await createMember();
    const done = await createMember();
    const failing = await createMember();
    const longAgo = addDays(new Date(), -30);
    await prisma.member.updateMany({
      where: { id: { in: [left.id, failing.id] } },
      data: { status: 'D', deleteDate: longAgo },
    });
    await prisma.member.update({
      where: { id: done.id },
      data: { status: 'D', deleteDate: longAgo, filesPurgedAt: longAgo },
    });
    // failing의 첫 폴더 삭제만 실패 (left → failing 순서로 지운다)
    vi.mocked(deletePrefixQuietly)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    expect(await runCleanupJob()).toMatchObject({ withdrawnFileMembers: 2, failed: 1 });
    const id = left.id.toString();
    expect(vi.mocked(deletePrefixQuietly).mock.calls.slice(0, 4).sort()).toEqual(
      [
        [`inquiry/${id}/`, 'private'],
        [`profile/${id}/`, 'public'],
        [`receipt/${id}/`, 'private'],
        [`site/${id}/`, 'private'],
      ].sort(),
    );
    const after = await prisma.member.findMany({
      where: { id: { in: [left.id, failing.id] } },
      orderBy: { id: 'asc' },
    });
    expect(after.map((m) => m.filesPurgedAt !== null)).toEqual([true, false]);

    // 다음 날 다시 돌면 실패했던 회원만 다시 지운다
    vi.mocked(deletePrefixQuietly).mockClear();
    expect(await runCleanupJob()).toMatchObject({ withdrawnFileMembers: 1, failed: 0 });
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: failing.id } })).filesPurgedAt,
    ).not.toBeNull();
  });

  it(`cleanup: 앞의 ${FILE_SWEEP_BATCH}명이 계속 실패해도 뒤의 탈퇴 회원까지 다시 지운다`, async () => {
    const members = [];
    for (let i = 0; i <= FILE_SWEEP_BATCH; i += 1) members.push(await createMember());
    await prisma.member.updateMany({
      where: { id: { in: members.map((m) => m.id) } },
      data: { status: 'D', deleteDate: addDays(new Date(), -3) },
    });
    const last = members[members.length - 1];
    // 마지막 회원 폴더만 지워지고 나머지는 계속 실패
    onTestFinished(() => {
      vi.mocked(deletePrefixQuietly).mockImplementation(() => Promise.resolve(true));
    });
    vi.mocked(deletePrefixQuietly).mockImplementation((prefix: string) =>
      Promise.resolve(prefix.includes(`/${last.id.toString()}/`)),
    );
    expect(await runCleanupJob()).toMatchObject({
      withdrawnFileMembers: FILE_SWEEP_BATCH + 1,
      failed: FILE_SWEEP_BATCH,
    });
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: last.id } })).filesPurgedAt,
    ).not.toBeNull();
    expect(await prisma.member.count({ where: { status: 'D', filesPurgedAt: null } })).toBe(
      FILE_SWEEP_BATCH,
    );
  });
});

describe('cleanup: 쓰이지 않는 업로드', () => {
  it('하루 지난 사진 중 어디에도 저장되지 않은 것만 지우고, 폴더 하나를 못 읽어도 나머지는 정리한다', async () => {
    const now = new Date();
    const old = addDays(now, -2);
    const me = await createMember();
    await prisma.member.update({
      where: { id: me.id },
      data: { profileImageKey: `profile/${me.id}/used.jpg` },
    });
    await prisma.inquiry.create({
      data: {
        userId: me.id,
        category: 'ETC',
        content: '문의',
        imageKey: `inquiry/${me.id}/used.jpg`,
      },
    });
    vi.mocked(listObjects).mockImplementation((prefix) => {
      if (prefix === 'profile/') {
        return Promise.resolve([
          { key: `profile/${me.id}/used.jpg`, createdAt: old },
          { key: `profile/${me.id}/orphan.jpg`, createdAt: old },
          { key: `profile/${me.id}/fresh.jpg`, createdAt: now }, // 아직 저장 중일 수 있다
        ]);
      }
      if (prefix === 'inquiry/') {
        return Promise.resolve([
          { key: `inquiry/${me.id}/used.jpg`, createdAt: old },
          { key: `inquiry/${me.id}/orphan.png`, createdAt: old },
        ]);
      }
      if (prefix === 'receipt/') return Promise.reject(new Error('목록을 못 읽음'));
      return Promise.resolve([]);
    });

    const result = await runCleanupJob(now);

    expect(vi.mocked(deleteObjectQuietly).mock.calls).toEqual([
      [`profile/${me.id}/orphan.jpg`, 'public'],
      [`inquiry/${me.id}/orphan.png`, 'private'],
    ]);
    expect(result).toMatchObject({ orphanUploads: 2, failed: 1 });
    expect(vi.mocked(listObjects).mock.calls.map(([prefix, kind]) => `${kind}:${prefix}`)).toEqual([
      'public:profile/',
      'public:review/',
      'private:receipt/',
      'private:site/',
      'private:inquiry/',
    ]);
  });
});
