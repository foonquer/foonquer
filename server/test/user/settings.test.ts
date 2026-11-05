import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { toKstIso } from '../../src/common/time';
import { prisma } from '../../src/lib/prisma';
import { deleteObjectQuietly } from '../../src/lib/storage';
import { resetDb } from '../helpers/db';
import {
  agreeConsents,
  bearer,
  createActiveSeason,
  createConquest,
  createMember,
  createRestaurant,
} from '../helpers/fixtures';
import { refreshCookieHeader } from '../helpers/http';

vi.mock('../../src/lib/storage', () => ({
  readObjectHead: vi.fn(() => Promise.resolve(null)),
  createUploadUrl: vi.fn(),
  deleteObjectQuietly: vi.fn(() => Promise.resolve()),
}));

const app = createApp();

const GAYANG = '1150010400'; // 강서구 가양동
const YEOKSAM = '1168010100'; // 강남구 역삼동

async function giveLocalRegions(userId: bigint, codes: string[]) {
  for (const [sortOrder, code] of codes.entries()) {
    const dong = await prisma.region.findUniqueOrThrow({ where: { code } });
    await prisma.memberLocalRegion.create({
      data: { userId, regionId: dong.id, sigunguId: dong.parentId ?? 0, sortOrder },
    });
  }
}

async function marketingRows(userId: bigint) {
  return prisma.memberConsent.findMany({
    where: { userId, consentType: 'MARKETING' },
    orderBy: { id: 'asc' },
  });
}

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SET-01 GET /users/me/settings', () => {
  it('알림 3종, 내 동네, 카카오 계정 가입 시각을 준다', async () => {
    const joinedAt = new Date('2026-09-10T11:01:00Z');
    const me = await createMember({ kakaoId: 'k-1', marketingAlarm: false, regDate: joinedAt });
    await agreeConsents(me.id);
    await giveLocalRegions(me.id, [GAYANG, YEOKSAM]);
    const lastMarketing = (await marketingRows(me.id)).at(-1);

    const res = await request(app)
      .get('/api/v1/users/me/settings')
      .set('Authorization', bearer(me.id));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('설정을 조회했어요.');
    expect(res.body.data.notification).toEqual({
      conquestAlarm: true,
      rankAlarm: true,
      marketingAlarm: false,
      marketingConsentChangedAt: toKstIso(lastMarketing!.regDate),
    });
    expect(
      res.body.data.localRegions.map((r: { dongName: string; sortOrder: number }) => [
        r.dongName,
        r.sortOrder,
      ]),
    ).toEqual([
      ['가양동', 0],
      ['역삼동', 1],
    ]);
    expect(res.body.data.account).toEqual({ provider: 'KAKAO', joinedAt: toKstIso(joinedAt) });
  });

  it('마케팅 동의 기록이 없으면 marketingConsentChangedAt은 null', async () => {
    const me = await createMember();
    const res = await request(app)
      .get('/api/v1/users/me/settings')
      .set('Authorization', bearer(me.id));
    expect(res.body.data.notification.marketingConsentChangedAt).toBeNull();
  });
});

describe('SET-02 PATCH /users/me/notification-settings', () => {
  function patch(userId: bigint, body: Record<string, unknown>) {
    return request(app)
      .patch('/api/v1/users/me/notification-settings')
      .set('Authorization', bearer(userId))
      .send(body);
  }

  it('보낸 항목만 바꾼다. 마케팅이 아니면 동의 이력을 남기지 않는다', async () => {
    const me = await createMember();
    const res = await patch(me.id, { rankAlarm: false });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('알림 설정을 바꿨어요.');
    expect(res.body.data).toEqual({
      conquestAlarm: true,
      rankAlarm: false,
      marketingAlarm: false,
      marketingConsentChangedAt: null,
    });
    expect(await marketingRows(me.id)).toHaveLength(0);
  });

  it('이벤트·혜택 알림을 켜고 끄면 동의·철회 이력을 남긴다', async () => {
    const me = await createMember();
    await agreeConsents(me.id);

    const on = await patch(me.id, { marketingAlarm: true });
    expect(on.status).toBe(200);
    expect(on.body.message).toBe('이벤트·혜택 알림 수신에 동의했어요.');
    expect(on.body.data.marketingAlarm).toBe(true);

    const off = await patch(me.id, { marketingAlarm: false });
    expect(off.body.message).toBe('이벤트·혜택 알림 수신을 거부했어요.');

    const rows = await marketingRows(me.id);
    expect(rows.map((r) => r.agreed)).toEqual([false, true, false]);
    const [, agreed, withdrawn] = rows;
    expect(agreed.agreedAt).not.toBeNull();
    expect(agreed.policyVersion).toBe('2026-09-01');
    expect(withdrawn.withdrawnAt).not.toBeNull();
    expect(off.body.data.marketingConsentChangedAt).toBe(toKstIso(withdrawn.regDate));
    expect((await prisma.member.findUniqueOrThrow({ where: { id: me.id } })).marketingAlarm).toBe(
      false,
    );
  });

  it('지금과 같은 값이면 이력을 남기지 않는다', async () => {
    const me = await createMember({ marketingAlarm: true });
    const res = await patch(me.id, { marketingAlarm: true });
    expect(res.body.message).toBe('알림 설정을 바꿨어요.');
    expect(await marketingRows(me.id)).toHaveLength(0);
  });

  it('같은 값으로 동시에 두 번 보내도 동의 이력은 한 번만 남긴다', async () => {
    const me = await createMember();
    const before = (await marketingRows(me.id)).length;
    const results = await Promise.all([
      patch(me.id, { marketingAlarm: true }),
      patch(me.id, { marketingAlarm: true }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const rows = await marketingRows(me.id);
    expect(rows).toHaveLength(before + 1);
    expect(rows.at(-1)?.agreed).toBe(true);
  });

  it('빈 요청은 400 NO_FIELDS_TO_UPDATE, true/false가 아니면 400 VALIDATION_ERROR', async () => {
    const me = await createMember();
    const empty = await patch(me.id, {});
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe('NO_FIELDS_TO_UPDATE');

    const wrong = await patch(me.id, { conquestAlarm: 'yes' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('VALIDATION_ERROR');
    expect(wrong.body.message).toBe('알림 값은 true/false로 보내 주세요.');
  });
});

describe('SET-03 GET /users/me/withdrawal-summary', () => {
  it('사라질 기록을 센다', async () => {
    const season = await createActiveSeason();
    const me = await createMember({ nickname: '아기깨비', pointBalance: 1280 });
    const gayang1 = await createRestaurant();
    const gayang2 = await createRestaurant();
    const yeoksam = await createRestaurant({ dongCode: YEOKSAM });
    for (const r of [gayang1, gayang2, yeoksam]) await createConquest(me.id, r, season.id);
    await prisma.mukkaebi.create({ data: { userId: me.id, level: 7 } });
    await prisma.seasonRegionStat.createMany({
      data: [
        {
          seasonId: season.id,
          sigunguId: gayang1.sigunguId,
          userId: me.id,
          tier: 'R',
          isFinalized: true,
        },
        {
          seasonId: season.id,
          sigunguId: yeoksam.sigunguId,
          userId: me.id,
          tier: 'B',
          isFinalized: true,
        },
      ],
    });
    const visit = await prisma.visit.findFirstOrThrow({ where: { userId: me.id } });
    await prisma.review.create({
      data: {
        visitId: visit.id,
        userId: me.id,
        restaurantId: visit.restaurantId!,
        overallScore: 4,
      },
    });

    const res = await request(app)
      .get('/api/v1/users/me/withdrawal-summary')
      .set('Authorization', bearer(me.id));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('탈퇴 안내를 조회했어요.');
    expect(res.body.data).toEqual({
      nickname: '아기깨비',
      conquest: { restaurantCount: 3, sigunguCount: 2 },
      pointBalance: 1280,
      mukkaebi: { level: 7, itemCount: 0 },
      titleCount: 1,
      reviewCount: 1,
      reasonOptions: [
        { code: 'RARELY_USE', label: '자주 쓰지 않아요' },
        { code: 'NO_RESTAURANT', label: '가고 싶은 맛집이 없어요' },
        { code: 'VERIFY_HARD', label: '영수증 인증이 번거로워요' },
        { code: 'ETC', label: '기타' },
      ],
    });
  });
});

describe('SET-04 DELETE /users/me', () => {
  function withdraw(userId: bigint, body: Record<string, unknown>) {
    return request(app).delete('/api/v1/users/me').set('Authorization', bearer(userId)).send(body);
  }

  it('개인정보·정복·먹깨비를 지우고 리뷰와 방문은 남긴다', async () => {
    const season = await createActiveSeason();
    const profileKey = 'profile/1/2b1f0e7a-4c1d-4d8e-9a55-0b3c2f6e19c9.jpg';
    const me = await createMember({
      kakaoId: 'k-me',
      nickname: '떠날깨비',
      gender: 'F',
      ageGroup: 20,
      pointBalance: 500,
      profileImageKey: profileKey,
    });
    const other = await createMember();
    await agreeConsents(me.id, { marketing: true });
    await giveLocalRegions(me.id, [GAYANG]);
    const restaurant = await createRestaurant();
    await prisma.restaurantStat.create({
      data: { restaurantId: restaurant.id, conquerorCount: 2 },
    });
    const { visit } = await createConquest(me.id, restaurant, season.id);
    await prisma.visit.update({ where: { id: visit.id }, data: { ocrRaw: { text: '영수증' } } });
    const review = await prisma.review.create({
      data: { visitId: visit.id, userId: me.id, restaurantId: restaurant.id, overallScore: 4.5 },
    });
    await prisma.mukkaebi.create({ data: { userId: me.id } });
    await prisma.savedRestaurant.create({ data: { userId: me.id, restaurantId: restaurant.id } });
    await prisma.memberBlock.create({ data: { blockerId: other.id, blockedId: me.id } });

    const res = await withdraw(me.id, {
      confirmed: true,
      reasonCode: 'ETC',
      reasonDetail: '이사 가서 더 이상 쓸 일이 없어요',
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('탈퇴했어요. 그동안 함께해 주셔서 고마워요.');
    expect(res.body.data.withdrawnAt).toMatch(/\+09:00$/);
    expect(refreshCookieHeader(res)).toContain('Max-Age=0');

    const member = await prisma.member.findUniqueOrThrow({ where: { id: me.id } });
    expect(member).toMatchObject({
      status: 'D',
      kakaoId: null,
      nickname: null,
      profileImageKey: null,
      gender: null,
      ageGroup: null,
      pointBalance: 0,
    });
    expect(member.deleteDate).not.toBeNull();
    expect(deleteObjectQuietly).toHaveBeenCalledWith(profileKey);

    const reason = await prisma.memberWithdrawal.findFirstOrThrow({ where: { userId: me.id } });
    expect(reason).toMatchObject({
      reasonCode: 'ETC',
      reasonDetail: '이사 가서 더 이상 쓸 일이 없어요',
    });

    expect(await prisma.conquest.count({ where: { userId: me.id } })).toBe(0);
    expect(await prisma.mukkaebi.count({ where: { userId: me.id } })).toBe(0);
    expect(await prisma.memberLocalRegion.count({ where: { userId: me.id } })).toBe(0);
    expect(await prisma.savedRestaurant.count({ where: { userId: me.id } })).toBe(0);
    expect(await prisma.memberBlock.count()).toBe(0);
    expect(
      (await prisma.restaurantStat.findUniqueOrThrow({ where: { restaurantId: restaurant.id } }))
        .conquerorCount,
    ).toBe(1);

    // 리뷰와 방문은 남고 영수증 원문만 지운다
    expect(await prisma.review.findUnique({ where: { id: review.id } })).not.toBeNull();
    const keptVisit = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(keptVisit.ocrRaw).toBeNull();

    // 동의 중이던 항목은 철회 이력이 남는다
    const latest = await prisma.memberConsent.findMany({
      where: { userId: me.id, withdrawnAt: { not: null } },
    });
    expect(latest.map((r) => r.consentType).sort()).toEqual([
      'LOCATION',
      'MARKETING',
      'PRIVACY',
      'TERMS',
    ]);

    // 탈퇴한 회원의 토큰은 더 쓸 수 없다
    const after = await request(app)
      .get('/api/v1/users/me/settings')
      .set('Authorization', bearer(me.id));
    expect(after.status).toBe(401);
  });

  it('같은 카카오 계정으로 다시 가입할 수 있게 kakao_id를 비운다', async () => {
    const me = await createMember({ kakaoId: 'k-again' });
    expect((await withdraw(me.id, { confirmed: true })).status).toBe(200);
    await expect(
      prisma.member.create({ data: { kakaoId: 'k-again', status: 'P' } }),
    ).resolves.toBeTruthy();
  });

  it('기타가 아니면 이유 상세는 저장하지 않는다', async () => {
    const me = await createMember();
    await withdraw(me.id, { confirmed: true, reasonCode: 'RARELY_USE', reasonDetail: '무시' });
    const reason = await prisma.memberWithdrawal.findFirstOrThrow({ where: { userId: me.id } });
    expect(reason).toMatchObject({ reasonCode: 'RARELY_USE', reasonDetail: null });
  });

  it('확인 안 함·잘못된 이유·255자 초과는 400', async () => {
    const me = await createMember();
    const notConfirmed = await withdraw(me.id, { confirmed: false });
    expect(notConfirmed.status).toBe(400);
    expect(notConfirmed.body.code).toBe('WITHDRAWAL_CONFIRM_REQUIRED');

    const badReason = await withdraw(me.id, { confirmed: true, reasonCode: 'BORED' });
    expect(badReason.body.code).toBe('INVALID_WITHDRAWAL_REASON');

    const tooLong = await withdraw(me.id, {
      confirmed: true,
      reasonCode: 'ETC',
      reasonDetail: 'a'.repeat(256),
    });
    expect(tooLong.body.code).toBe('REASON_DETAIL_TOO_LONG');

    expect((await prisma.member.findUniqueOrThrow({ where: { id: me.id } })).status).toBe('A');
  });

  it('동시에 두 번 눌러도 한 번만 탈퇴한다', async () => {
    const me = await createMember();
    const results = await Promise.all([
      withdraw(me.id, { confirmed: true }),
      withdraw(me.id, { confirmed: true }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect([401, 409]).toContain(statuses[1]);
    expect(await prisma.memberWithdrawal.count({ where: { userId: me.id } })).toBe(1);
  });
});
