import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays } from '../../src/common/time';
import { runCleanupJob, runRatingJob, runSavedReminderJob } from '../../src/jobs/jobs';
import { prisma } from '../../src/lib/prisma';
import { deletePrefixQuietly } from '../../src/lib/storage';
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
}));

beforeEach(async () => {
  await resetDb();
  vi.mocked(deletePrefixQuietly).mockClear();
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

  it('rating: 6개월 지난 리뷰는 시간 감쇠로 덜 반영한다', async () => {
    const season = await createActiveSeason(3);
    const shop = await createRestaurant();
    const a = await createMember();
    const b = await createMember();
    const v1 = await createVisit(a.id, shop.id, { seasonId: season.id });
    const v2 = await createVisit(b.id, shop.id, { seasonId: season.id });
    await prisma.review.create({
      data: {
        visitId: v1.id,
        userId: a.id,
        restaurantId: shop.id,
        overallScore: 1,
        regDate: addDays(new Date(), -400),
      },
    });
    await prisma.review.create({
      data: { visitId: v2.id, userId: b.id, restaurantId: shop.id, overallScore: 5 },
    });
    expect(await runRatingJob()).toMatchObject({ restaurants: 1, failed: 0 });
    const stat = await prisma.restaurantStat.findUniqueOrThrow({
      where: { restaurantId: shop.id },
    });
    // w1 = 1 × 0.49(13개월 → 0.7²), w2 = 1 → R = (5×3.8 + 0.49×1 + 5) / (5 + 1.49) ≈ 3.8
    expect(stat.weightSum.toNumber()).toBeCloseTo(1.49, 2);
    expect(stat.displayScore?.toNumber()).toBe(3.8);
    expect(stat.scoreSum.toNumber()).toBe(6);
  });

  it('cleanup: 사진 삭제가 끝나지 않은 탈퇴 회원(files_purged_at 없음)의 폴더를 다 지울 때까지 다시 지운다', async () => {
    const [left, done, failing] = await Promise.all([
      createMember(),
      createMember(),
      createMember(),
    ]);
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
});
