import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { addDays, kstWeekStartAsDbDate } from '../../src/common/time';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from '../helpers/db';
import {
  bearer,
  createActiveSeason,
  createMember,
  createRestaurant,
  createVisit,
} from '../helpers/fixtures';

const app = createApp();
const GAYANG = '1150010400'; // 강서구 가양동

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const api = (userId: bigint) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set('Authorization', bearer(userId)),
  post: (path: string, body?: object) =>
    request(app).post(`/api/v1${path}`).set('Authorization', bearer(userId)).send(body),
});

/** 내 동네가 가양동인 회원 */
async function member(data: Parameters<typeof createMember>[0] = {}) {
  const me = await createMember(data);
  const gayang = await prisma.region.findUniqueOrThrow({ where: { code: GAYANG } });
  await prisma.memberLocalRegion.create({
    data: { userId: me.id, regionId: gayang.id, sigunguId: gayang.parentId ?? 0 },
  });
  return { me, gayang };
}

/** 인증 리뷰가 쌓인 가게 (맛 별점·세부 별점 평균) */
async function rated(
  name: string,
  scores: { taste: number; cleanliness: number; categoryId?: number; reviews?: number },
) {
  const shop = await createRestaurant({ name, categoryId: scores.categoryId ?? 1 });
  const n = scores.reviews ?? 5;
  await prisma.restaurantStat.create({
    data: {
      restaurantId: shop.id,
      reviewCount: n,
      displayScore: scores.taste,
      detailReviewCount: n,
      cleanlinessSum: Math.round(scores.cleanliness * n),
      portionSum: 4 * n,
      serviceSum: 4 * n,
      priceSum: 4 * n,
    },
  });
  return shop;
}

/** 지난 날짜의 성공한 방문 인증 (활동량·최근 한 달 기록) */
async function pastVisit(userId: bigint, restaurantId: bigint, daysAgo: number) {
  return createVisit(userId, restaurantId, {
    status: 'C',
    verifiedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
  });
}

function rate(userId: bigint, visitId: bigint) {
  return api(userId).post(`/visits/${visitId}/rating`, { overallScore: 4 });
}

describe('QUEST-01 이번 주 퀘스트', () => {
  it('처음 열면 활동량만큼 만든다: 방문이 적으면 쉬움·탐험 2개, 같은 구의 안 가 본 곳, 다시 열어도 그대로', async () => {
    const { me } = await member();
    const visited = await createRestaurant({ name: '가 본 집' });
    await pastVisit(me.id, visited.id, 40);
    for (let i = 0; i < 5; i += 1) await createRestaurant({ name: `동네가게${i}` });
    await createRestaurant({ name: '다른 구 가게', dongCode: '1144012000' });

    const res = await api(me.id).get('/quests/current');
    expect(res.status).toBe(200);
    const { week, quests } = res.body.data;
    expect(week).toMatchObject({
      activity: 'LOW',
      activityName: '활동 적음',
      baseCount: 2,
      doneCount: 0,
    });
    expect(week.swapAvailable).toBe(true);
    expect(week.daysLeft).toBeGreaterThanOrEqual(0);
    // 맞춤 기록이 없으니 첫 평가자(쉬움) + 동네 새 가게(탐험)
    expect(quests.map((q: { level: string; type: string }) => [q.level, q.type])).toEqual([
      ['EASY', 'FIRST_REVIEWER'],
      ['EXPLORE', 'LOCAL_PICK'],
    ]);
    for (const q of quests) {
      expect(q.restaurant.name).toMatch(/^동네가게/);
      expect(q.reasons.length).toBeGreaterThan(0);
    }
    expect(quests.map((q: { rewardPoint: number }) => q.rewardPoint)).toEqual([50, 100]);

    const again = await api(me.id).get('/quests/current');
    expect(again.body.data.quests.map((q: { questId: number }) => q.questId)).toEqual(
      quests.map((q: { questId: number }) => q.questId),
    );
    expect(await prisma.questWeek.count()).toBe(1);
  });

  it('지난 4주 방문이 주 2회 이상이면 3개(도전 포함), 내 동네가 없으면 만들지 않는다', async () => {
    const { me } = await member();
    const shops = [];
    for (let i = 0; i < 6; i += 1) shops.push(await createRestaurant({ name: `동네가게${i}` }));
    // 이번 주 월요일 전 4주 안에 8번
    const daysSinceMonday = Math.round(
      (Date.now() - kstWeekStartAsDbDate().getTime() + 9 * 60 * 60 * 1000) / 86_400_000,
    );
    for (let i = 0; i < 8; i += 1) await pastVisit(me.id, shops[0].id, daysSinceMonday + 2 + i);
    const other = await prisma.region.findFirstOrThrow({
      where: { level: 3, parent: { name: '강서구' }, code: { not: GAYANG } },
    });
    await createRestaurant({ name: '옆동네1', dongCode: other.code });
    await createRestaurant({ name: '옆동네2', dongCode: other.code });

    const res = await api(me.id).get('/quests/current');
    const { week, quests } = res.body.data;
    expect(week).toMatchObject({ activity: 'MEDIUM', baseCount: 3 });
    expect(quests.map((q: { level: string }) => q.level)).toEqual(['EASY', 'EXPLORE', 'CHALLENGE']);
    const challenge = quests[2];
    expect(challenge).toMatchObject({
      type: 'NEXT_DONG',
      target: 2,
      progress: 0,
      restaurant: null,
    });
    expect(challenge.region.name).not.toBe('가양동');

    const lonely = await createMember();
    const none = await api(lonely.id).get('/quests/current');
    expect(none.body.data).toEqual({ enabled: true, week: null, quests: [], streak: 0 });
  });

  it('맞춤 추천: 청결을 아주 중요하게 보면 청결 점수가 높은 곳, 같은 곳만 가면 같은 종류의 새 가게', async () => {
    const { me } = await member({ weightCleanliness: 3 });
    await rated('청결왕', { taste: 4.0, cleanliness: 4.8 });
    await rated('맛집', { taste: 4.6, cleanliness: 3.0 });
    const res = await api(me.id).get('/quests/current');
    const explore = res.body.data.quests.find((q: { level: string }) => q.level === 'EXPLORE');
    expect(explore).toMatchObject({ type: 'MY_STANDARD', restaurant: { name: '청결왕' } });
    expect(explore.reasons[0]).toContain('중요하게 보는 청결이 4.8점이에요 (강서구 평균 3.9)');

    // 최근 한 달 방문 4번 중 3번이 같은 국밥집(한식) → 단골 말고 새 한식집
    const { me: regular } = await member();
    const usual = await createRestaurant({ name: '단골국밥', categoryId: 1 });
    const cafe = await createRestaurant({ name: '카페', categoryId: 11 });
    for (const d of [3, 5, 9]) await pastVisit(regular.id, usual.id, d);
    await pastVisit(regular.id, cafe.id, 4);
    // 위의 청결왕(한식, 내 종합 4.2)보다 내 종합이 높은 한식집
    await rated('새국밥', { taste: 4.8, cleanliness: 4.6, categoryId: 1 });
    await rated('중국집', { taste: 4.9, cleanliness: 4.9, categoryId: 2 });
    const quests = (await api(regular.id).get('/quests/current')).body.data.quests;
    const taste = quests.find((q: { level: string }) => q.level === 'EXPLORE');
    expect(taste).toMatchObject({
      type: 'NEW_TASTE',
      title: '단골 한식집 말고 새 한식집',
      summary: '최근 한 달 방문의 75%가 같은 한식집이에요',
      restaurant: { name: '새국밥' },
    });
  });

  it('맞춤 퀘스트를 끄면 퀘스트를 만들지 않고, 맞춤 추천을 끄면 기록 대신 동네 새 가게', async () => {
    const { me } = await member({ questEnabled: false });
    await createRestaurant();
    expect((await api(me.id).get('/quests/current')).body.data).toEqual({
      enabled: false,
      week: null,
      quests: [],
      streak: 0,
    });
    expect(await prisma.questWeek.count()).toBe(0);

    const { me: plain } = await member({ weightCleanliness: 3, personalizedReco: false });
    await rated('청결왕', { taste: 4.0, cleanliness: 4.8 });
    const quests = (await api(plain.id).get('/quests/current')).body.data.quests;
    expect(quests.find((q: { level: string }) => q.level === 'EXPLORE').type).toBe('LOCAL_PICK');
  });
});

describe('퀘스트 완료 (REVIEW-01 방문 인증 + 맛 별점)', () => {
  it('퀘스트 가게를 정복하면 완료·포인트, 이번 주 모두 깨면 주간 상자와 보너스 퀘스트, 기록에 남는다', async () => {
    const season = await createActiveSeason(3);
    const { me } = await member();
    for (let i = 0; i < 6; i += 1) await createRestaurant({ name: `동네가게${i}` });
    const { quests } = (await api(me.id).get('/quests/current')).body.data;
    const [easy, explore] = quests;

    const v1 = await createVisit(me.id, BigInt(easy.restaurant.restaurantId), {
      status: 'V',
      seasonId: season.id,
    });
    const first = await rate(me.id, v1.id);
    expect(first.status).toBe(201);
    expect(first.body.data.quest).toMatchObject({
      completed: [{ questId: easy.questId, typeName: '첫 평가자', rewardPoint: 50 }],
      week: { baseCount: 2, doneCount: 1, boxId: null },
      bonusQuest: null,
    });
    // 정복 보상과 별개로 퀘스트 보상 +50 (먹포인트 내역에 퀘스트로 남는다)
    const questPoint = await prisma.pointHistory.findFirstOrThrow({
      where: { userId: me.id, refType: 'QUEST', refId: BigInt(easy.questId) },
    });
    expect(questPoint).toMatchObject({
      amount: 50,
      reason: 'QUEST_EASY',
      title: '퀘스트 완료 · 첫 평가자',
    });

    const v2 = await createVisit(me.id, BigInt(explore.restaurant.restaurantId), {
      status: 'V',
      seasonId: season.id,
    });
    const second = await rate(me.id, v2.id);
    const quest = second.body.data.quest;
    expect(quest.week).toMatchObject({ baseCount: 2, doneCount: 2, streak: 1 });
    expect(quest.week.boxId).not.toBeNull();
    const box = await prisma.memberItemBox.findUniqueOrThrow({
      where: { id: BigInt(quest.week.boxId) },
    });
    expect(box).toMatchObject({ source: 'QUEST_WEEK', status: 'U' });
    expect(quest.bonusQuest).toMatchObject({ typeName: '첫 평가자', rewardPoint: 50 });

    const sheet = (await api(me.id).get('/quests/current')).body.data;
    expect(sheet.week).toMatchObject({ baseCount: 2, doneCount: 2, boxReceived: true });
    expect(
      sheet.quests.map((q: { status: string; isBonus: boolean }) => [q.status, q.isBonus]),
    ).toEqual([
      ['DONE', false],
      ['DONE', false],
      ['ACTIVE', true],
    ]);
    expect(sheet.streak).toBe(1);

    const records = (await api(me.id).get('/quests/records')).body.data;
    expect(records).toMatchObject({
      streak: 1,
      thisWeekDone: true,
      completedCount: 2,
      placeCount: 2,
      pointTotal: 150,
      streakGoal: { name: '꾸준한 탐험가', target: 4, achieved: false },
      placesGoal: { name: '새 맛 수집가', target: 10, achieved: false },
    });
    expect(records.weeks[0]).toMatchObject({
      isCurrent: true,
      baseCount: 2,
      doneCount: 2,
      boxReceived: true,
    });
    const week = (await api(me.id).get(`/quests/weeks/${records.weeks[0].weekId}`)).body.data;
    expect(week.quests).toHaveLength(3);
  });

  it('4주 연속 모두 깨면 업적 "꾸준한 탐험가", 옆 동네 한 바퀴는 그 동에서 처음 가는 곳마다 진행', async () => {
    const season = await createActiveSeason(3);
    const { me } = await member();
    const thisWeek = kstWeekStartAsDbDate();
    for (const w of [1, 2, 3]) {
      await prisma.questWeek.create({
        data: {
          userId: me.id,
          weekStart: addDays(thisWeek, -7 * w),
          baseCount: 2,
          activity: 'L',
          completedAt: addDays(thisWeek, -7 * w + 2),
        },
      });
    }
    const other = await prisma.region.findFirstOrThrow({
      where: { level: 3, parent: { name: '강서구' }, code: { not: GAYANG } },
    });
    const a = await createRestaurant({ dongCode: other.code });
    const b = await createRestaurant({ dongCode: other.code });
    const week = await prisma.questWeek.create({
      data: { userId: me.id, weekStart: thisWeek, baseCount: 1, activity: 'L' },
    });
    const quest = await prisma.quest.create({
      data: {
        weekId: week.id,
        userId: me.id,
        type: 'NEXT_DONG',
        level: 'C',
        regionId: other.id,
        target: 2,
        title: '옆 동네',
        summary: '옆 동네',
        reasons: [],
        rewardPoint: 150,
      },
    });

    const r1 = await rate(
      me.id,
      (await createVisit(me.id, a.id, { status: 'V', seasonId: season.id })).id,
    );
    expect(r1.body.data.quest).toBeNull();
    expect((await prisma.quest.findUniqueOrThrow({ where: { id: quest.id } })).progress).toBe(1);

    const r2 = await rate(
      me.id,
      (await createVisit(me.id, b.id, { status: 'V', seasonId: season.id })).id,
    );
    expect(r2.body.data.quest.completed[0]).toMatchObject({
      typeName: '옆 동네 한 바퀴',
      rewardPoint: 150,
    });
    expect(r2.body.data.quest.week.streak).toBe(4);
    expect(r2.body.data.quest.achievements.map((x: { name: string }) => x.name)).toContain(
      '꾸준한 탐험가',
    );
  });
});

describe('QUEST-02~04 상세·바꾸기·관심 없어요', () => {
  it('상세에 이유·주간 상자까지 남은 수, 바꾸기는 주 1번, 관심 없어요는 그 종류를 덜 추천', async () => {
    const { me } = await member({ weightCleanliness: 3 });
    for (let i = 0; i < 8; i += 1) await createRestaurant({ name: `동네가게${i}` });
    await rated('청결왕', { taste: 4.0, cleanliness: 4.8 });
    await rated('청결이', { taste: 4.0, cleanliness: 4.5 });
    const { quests } = (await api(me.id).get('/quests/current')).body.data;
    const [easy, explore] = quests;

    const detail = (await api(me.id).get(`/quests/${explore.questId}`)).body.data;
    expect(detail).toMatchObject({ type: 'MY_STANDARD', boxRemaining: 1, canChange: true });
    expect(detail.week.swapAvailable).toBe(true);
    expect(detail.restaurant).toMatchObject({ name: '청결왕', tasteScore: 4, isConquered: false });

    const swapped = await api(me.id).post(`/quests/${easy.questId}/swap`);
    expect(swapped.status).toBe(200);
    expect(swapped.body.data.level).toBe('EASY');
    expect(swapped.body.data.restaurant.restaurantId).not.toBe(easy.restaurant.restaurantId);
    expect(
      (await prisma.quest.findUniqueOrThrow({ where: { id: BigInt(easy.questId) } })).status,
    ).toBe('S');
    const twice = await api(me.id).post(`/quests/${swapped.body.data.questId}/swap`);
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe('QUEST_SWAP_USED');

    const dismissed = await api(me.id).post(`/quests/${explore.questId}/dismiss`);
    expect(dismissed.status).toBe(200);
    expect(dismissed.body.data.type).not.toBe('MY_STANDARD');
    const dislike = await prisma.questDislike.findUniqueOrThrow({
      where: { userId_type: { userId: me.id, type: 'MY_STANDARD' } },
    });
    expect(dislike.count).toBe(1);
    const sheet = (await api(me.id).get('/quests/current')).body.data;
    expect(sheet.quests).toHaveLength(2);
    expect(sheet.week.swapAvailable).toBe(false);

    const stranger = await createMember();
    expect((await api(stranger.id).get(`/quests/${easy.questId}`)).status).toBe(404);
  });
});

describe('SET-01·02 맞춤 퀘스트 설정', () => {
  it('맞춤 퀘스트·맞춤 추천을 조회하고 바꾼다', async () => {
    const { me } = await member();
    const before = (await api(me.id).get('/users/me/settings')).body.data;
    expect(before.personalization).toEqual({ questEnabled: true, personalizedReco: true });
    const res = await request(app)
      .patch('/api/v1/users/me/notification-settings')
      .set('Authorization', bearer(me.id))
      .send({ questEnabled: false, personalizedReco: false });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('설정을 바꿨어요.');
    expect(res.body.data).toMatchObject({ questEnabled: false, personalizedReco: false });
  });
});
