import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { addPoint, grantReward, spendPoint } from '../../src/modules/reward/reward.service';
import { resetDb } from '../helpers/db';
import { createMember } from '../helpers/fixtures';

beforeEach(async () => {
  await resetDb();
});

describe('POINT-03 grantReward / addPoint / spendPoint', () => {
  it('reward_policy대로 포인트·경험치를 주고 같은 원인은 한 번만 준다', async () => {
    const me = await createMember();
    const first = await prisma.$transaction((tx) =>
      grantReward(tx, me.id, 'VISIT_VERIFIED', '새맛집 방문 인증', { type: 'VISIT', id: 1 }),
    );
    expect(first).toEqual({ point: 50, exp: 20, levelUp: null });
    const again = await prisma.$transaction((tx) =>
      grantReward(tx, me.id, 'VISIT_VERIFIED', '새맛집 방문 인증', { type: 'VISIT', id: 1 }),
    );
    expect(again.point).toBe(0);

    const member = await prisma.member.findUniqueOrThrow({ where: { id: me.id } });
    expect(member.pointBalance).toBe(50);
    const history = await prisma.pointHistory.findMany({ where: { userId: me.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ amount: 50, balanceAfter: 50, title: '새맛집 방문 인증' });
    expect((await prisma.mukkaebi.findUniqueOrThrow({ where: { userId: me.id } })).exp).toBe(20);
  });

  it('경험치로 레벨이 오르면 레벨마다 LEVEL_UP 포인트를 준다', async () => {
    const me = await createMember();
    await prisma.mukkaebi.create({ data: { userId: me.id, exp: 95 } });
    const result = await prisma.$transaction((tx) =>
      grantReward(tx, me.id, 'VISIT_VERIFIED', '방문 인증', { type: 'VISIT', id: 2 }),
    );
    expect(result.levelUp).toEqual({ from: 1, to: 2 });
    const mukkaebi = await prisma.mukkaebi.findUniqueOrThrow({ where: { userId: me.id } });
    expect(mukkaebi).toMatchObject({ exp: 115, level: 2 });
    const reasons = (
      await prisma.pointHistory.findMany({ where: { userId: me.id }, orderBy: { id: 'asc' } })
    ).map((h) => h.reason);
    expect(reasons).toEqual(['VISIT_VERIFIED', 'LEVEL_UP']);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: me.id } })).pointBalance).toBe(
      250,
    );
  });

  it('하루 한도(REVIEW_VOTE 10번)를 넘으면 주지 않는다', async () => {
    const me = await createMember();
    for (let i = 1; i <= 11; i += 1) {
      await prisma.$transaction((tx) =>
        grantReward(tx, me.id, 'REVIEW_VOTE', '리뷰 평가 참여', { type: 'REVIEW_REACTION', id: i }),
      );
    }
    expect(
      await prisma.pointHistory.count({ where: { userId: me.id, reason: 'REVIEW_VOTE' } }),
    ).toBe(10);
  });

  it('잔액이 모자라면 409 POINT_NOT_ENOUGH, 충분하면 빼고 내역을 남긴다', async () => {
    const me = await createMember();
    await prisma.$transaction((tx) =>
      addPoint(tx, me.id, 300, 'ADMIN', '테스트 지급', { type: 'ADMIN', id: 1 }),
    );
    await expect(
      prisma.$transaction((tx) =>
        spendPoint(tx, me.id, 450, 'PURCHASE', '병아리 모자 구매', { type: 'ITEM', id: 1 }),
      ),
    ).rejects.toMatchObject({
      code: 'POINT_NOT_ENOUGH',
      data: { balance: 300, price: 450, shortage: 150 },
    });

    const balance = await prisma.$transaction((tx) =>
      spendPoint(tx, me.id, 200, 'PURCHASE', '새싹 모자 구매', { type: 'ITEM', id: 2 }),
    );
    expect(balance).toBe(100);
    const last = await prisma.pointHistory.findFirstOrThrow({
      where: { userId: me.id },
      orderBy: { id: 'desc' },
    });
    expect(last).toMatchObject({ amount: -200, balanceAfter: 100, reason: 'PURCHASE' });
  });
});
