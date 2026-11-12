import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { addDays, kstTodayAsDbDate } from '../../src/common/time';
import { clearDemoData, seedDemoData, seedDemoReviews } from '../../src/jobs/demo-data';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from '../helpers/db';
import {
  bearer,
  createConquest,
  createMember,
  createRestaurant,
  createVisit,
} from '../helpers/fixtures';

const app = createApp();
const GAYANG = '1150010400'; // 강서구 가양동

beforeEach(async () => {
  await resetDb();
});

/** 운영처럼 지난 시즌 2개(확정, 기록 없음) + 진행 중 시즌 */
async function createSeasons() {
  const today = kstTodayAsDbDate();
  const current = await prisma.season.create({
    data: {
      seasonNo: 3,
      startDate: addDays(today, -60),
      endDate: addDays(today, 120),
      status: 'A',
    },
  });
  const second = await prisma.season.create({
    data: {
      seasonNo: 2,
      startDate: addDays(today, -244),
      endDate: addDays(today, -61),
      status: 'F',
    },
  });
  const first = await prisma.season.create({
    data: {
      seasonNo: 1,
      startDate: addDays(today, -425),
      endDate: addDays(today, -245),
      status: 'F',
    },
  });
  return { current, second, first };
}

/** 내 계정(가양동이 내 동네, 이번 시즌 진짜 정복 1곳)과 진짜 회원(2곳), 강서구 가게 50곳·마포구 가게 10곳 */
async function setup() {
  const seasons = await createSeasons();
  const gayang = await prisma.region.findUniqueOrThrow({ where: { code: GAYANG } });
  const mapoDong = await prisma.region.findFirstOrThrow({
    where: { level: 3, parent: { name: '마포구' } },
  });
  const gangseo = [];
  for (let i = 0; i < 50; i += 1) gangseo.push(await createRestaurant({ dongCode: GAYANG }));
  for (let i = 0; i < 10; i += 1) await createRestaurant({ dongCode: mapoDong.code });

  const me = await createMember({ nickname: '안준형', pointBalance: 100 });
  await prisma.memberLocalRegion.create({
    data: { userId: me.id, regionId: gayang.id, sigunguId: gayang.parentId ?? 0 },
  });
  // 내 계정의 진짜 기록: 먹포인트 내역·알림·산 얼굴 아이템(쓰고 있음) — clear가 남겨 둬야 한다
  const face = await prisma.item.findFirstOrThrow({
    where: { category: 'FACE', requiredAchievementId: null, seasonRewardRules: { none: {} } },
  });
  await prisma.memberItem.create({ data: { userId: me.id, itemId: face.id, acquiredType: 'P' } });
  await prisma.mukkaebi.create({ data: { userId: me.id, faceItemId: face.id } });
  await prisma.pointHistory.create({
    data: { userId: me.id, amount: 100, balanceAfter: 100, reason: 'ADMIN', title: '진짜 적립' },
  });
  await prisma.notification.create({
    data: {
      userId: me.id,
      category: 'NOTICE',
      type: 'NOTICE',
      title: '진짜 공지',
      content: '공지',
    },
  });
  const real = await createMember({ nickname: '진짜회원' });
  await createConquest(me.id, gangseo[0], seasons.current.id);
  await createConquest(real.id, gangseo[0], seasons.current.id);
  await createConquest(real.id, gangseo[1], seasons.current.id);
  // 별점을 아직 안 남긴 진짜 방문 — seed는 이 가게에 가짜 정복을 만들면 안 된다
  await createVisit(me.id, gangseo[2].id, { seasonId: seasons.current.id, status: 'V' });
  for (const userId of [me.id, real.id]) {
    await prisma.seasonRegionStat.create({
      data: {
        seasonId: seasons.current.id,
        sigunguId: gayang.parentId ?? 0,
        userId,
        conquestCount: userId === me.id ? 1 : 2,
        lastConqueredAt: new Date(),
        rankNo: userId === me.id ? 2 : 1,
        topPercent: userId === me.id ? 100 : 50,
        tier: userId === me.id ? 'B' : 'M',
      },
    });
  }
  return { ...seasons, me, real, face, gangseo, gangseoId: gayang.parentId ?? 0 };
}

describe('랭킹 확인용 가짜 데이터 (demo-data)', () => {
  it('seed: 가짜 탐험가와 시즌별 정복을 넣고, 지난 시즌은 확정 결과·보상까지, clear는 모두 되돌린다', async () => {
    const { current, second, first, me, real, face, gangseo, gangseoId } = await setup();

    const seeded = await seedDemoData('안준형');
    expect(seeded.members).toBe(24);
    expect(seeded.sigungus).toBe(2);
    expect(seeded.seasons).toEqual([3, 2, 1]);

    // 이번 시즌 구 랭킹: 가짜 21명 + 나 + 진짜 회원, 나는 진짜 정복 1곳 + 가짜 27곳 = 28곳으로 3위
    const ranking = await request(app)
      .get(`/api/v1/rankings/sigungus/${gangseoId}`)
      .set('Authorization', bearer(me.id));
    expect(ranking.status).toBe(200);
    expect(ranking.body.data.items).toHaveLength(23);
    expect(ranking.body.data.items.map((i: { rank: number }) => i.rank)).toEqual(
      Array.from({ length: 23 }, (_, i) => i + 1),
    );
    expect(ranking.body.data.myRank).toMatchObject({ rank: 3, conquestCount: 28 });
    expect(ranking.body.data.topPicks[0].pickCount).toBe(2);

    // 역대 랭킹: 지난 시즌도 확정 순위가 보이고, 내 시즌 결과는 1위(먹짱)·미식가
    const past = await request(app)
      .get(`/api/v1/rankings/sigungus/${gangseoId}`)
      .query({ seasonId: first.id })
      .set('Authorization', bearer(me.id));
    expect(past.body.data.items).toHaveLength(22);
    expect(past.body.data.myRank).toMatchObject({ rank: 1, conquestCount: 40 });
    const results = await prisma.seasonResult.findMany({ where: { userId: me.id } });
    const resultOf = (seasonId: number) => {
      const r = results.find((x) => x.seasonId === seasonId);
      return [r?.bestTier, r?.bestRankNo];
    };
    expect(resultOf(first.id)).toEqual(['M', 1]);
    // 지난 시즌 24곳: 38·31·26 다음 4위, 상위 18%라 정복자가 아닌 미식가
    expect(resultOf(second.id)).toEqual(['G', 4]);
    const records = await request(app)
      .get('/api/v1/users/me/season-records')
      .set('Authorization', bearer(me.id));
    expect(records.status).toBe(200);
    const after = await prisma.member.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.pointBalance).toBeGreaterThan(100);
    expect(await prisma.memberItem.count({ where: { userId: me.id } })).toBeGreaterThan(0);
    const seasons = await prisma.season.findMany({ where: { id: { in: [first.id, second.id] } } });
    expect(seasons.every((s) => s.status === 'F' && s.finalizedAt !== null)).toBe(true);

    await expect(seedDemoData('안준형')).rejects.toThrow('이미 있어요');
    expect(
      await prisma.conquest.count({ where: { userId: me.id, restaurantId: gangseo[2].id } }),
    ).toBe(0);

    // 확인하다가 가짜 정복이 있는 가게 두 곳을 진짜로 인증하고 정복까지 마쳤다 (정복은 새로 안 생김).
    // 한 곳은 별점 기록이 있고, 한 곳은 없다
    const [fake, fakeNoReview] = await prisma.conquest.findMany({
      where: {
        userId: me.id,
        seasonId: current.id,
        visit: { receiptImageKey: 'demo/receipt.jpg' },
      },
      take: 2,
    });
    const verifiedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const ratedAt = new Date(Date.now() - 60 * 60 * 1000);
    const realVisit = await createVisit(me.id, fake.restaurantId, {
      seasonId: current.id,
      verifiedAt,
    });
    await prisma.review.create({
      data: {
        visitId: realVisit.id,
        userId: me.id,
        restaurantId: fake.restaurantId,
        overallScore: 4.5,
        regDate: ratedAt,
      },
    });
    const realNoReview = await createVisit(me.id, fakeNoReview.restaurantId, {
      seasonId: current.id,
      verifiedAt,
    });

    // 확인하다가 먹깨비에 받은 왕관을 써 보고 가짜 탐험가를 차단해 봤다
    const crown = await prisma.memberItem.findFirstOrThrow({
      where: { userId: me.id, item: { category: 'HAT' } },
    });
    await prisma.mukkaebi.update({ where: { userId: me.id }, data: { hatItemId: crown.itemId } });
    const someone = await prisma.member.findFirstOrThrow({ where: { kakaoId: 'demo-01' } });
    await prisma.memberBlock.create({ data: { blockerId: me.id, blockedId: someone.id } });

    const cleared = await clearDemoData('안준형');
    expect(cleared).toMatchObject({ members: 24, seasons: [1, 2] });
    expect(await prisma.member.count()).toBe(2);

    // 내 계정은 처음 그대로: 진짜 정복 1곳 + 진짜로 정복을 마친 두 곳(가짜 정복을 진짜 방문으로 옮김),
    // 먹포인트 100, 진짜 내역·알림·아이템(쓰고 있던 얼굴 포함)만 남는다
    const mine = await prisma.member.findUniqueOrThrow({
      where: { id: me.id },
      include: { mukkaebi: true },
    });
    expect(mine.pointBalance).toBe(100);
    expect(mine.mukkaebi?.hatItemId).toBeNull();
    expect(mine.mukkaebi?.faceItemId).toBe(face.id);
    const myConquests = await prisma.conquest.findMany({ where: { userId: me.id } });
    expect(myConquests).toHaveLength(3);
    // 정복 시각 = 별점 등록 시각, 별점 기록이 없으면 인증 시각 (구 순위 동점 순서에 쓰인다)
    const movedOf = (id: bigint) => myConquests.find((c) => c.id === id);
    expect([movedOf(fake.id)?.visitId, movedOf(fake.id)?.conqueredAt]).toEqual([
      realVisit.id,
      ratedAt,
    ]);
    expect([movedOf(fakeNoReview.id)?.visitId, movedOf(fakeNoReview.id)?.conqueredAt]).toEqual([
      realNoReview.id,
      verifiedAt,
    ]);
    expect(await prisma.visit.count({ where: { userId: me.id } })).toBe(4);
    const where = { where: { userId: me.id } };
    const left = await Promise.all([
      prisma.memberItem.findMany(where),
      prisma.notification.findMany(where),
      prisma.pointHistory.findMany(where),
    ]);
    expect(left.map((rows) => rows.length)).toEqual([1, 1, 1]);
    expect(left[0][0].itemId).toBe(face.id);
    expect(left[1][0].title).toBe('진짜 공지');
    expect(left[2][0].title).toBe('진짜 적립');
    const gone = await Promise.all([
      prisma.memberAchievement.count(where),
      prisma.seasonResult.count(where),
      prisma.memberBlock.count({ where: { blockerId: me.id } }),
    ]);
    expect(gone).toEqual([0, 0, 0]);
    // 이번 시즌 순위는 진짜 기록대로 다시 계산되고, 지난 시즌은 다시 비어 있다
    const stats = await prisma.seasonRegionStat.findMany({ orderBy: { rankNo: 'asc' } });
    expect(stats.map((s) => [s.userId, s.seasonId, s.conquestCount, s.rankNo, s.tier])).toEqual([
      [me.id, current.id, 3, 1, 'M'],
      [real.id, current.id, 2, 2, 'B'],
    ]);
    const restored = await prisma.season.findMany({ where: { id: { in: [first.id, second.id] } } });
    expect(restored.every((s) => s.status === 'F' && s.finalizedAt === null)).toBe(true);
    expect(await prisma.conquest.count({ where: { userId: real.id } })).toBe(2);
  }, 120_000);

  it('reviews: 가짜 방문마다 리뷰, 내 동네(동)에 가짜 방문을 넣어 추천이 차고, clear가 가게 별점까지 되돌린다', async () => {
    const { me } = await setup();
    await expect(seedDemoReviews('안준형')).rejects.toThrow('seed를 먼저');
    await seedDemoData('안준형');
    const demo = await prisma.member.findMany({
      where: { kakaoId: { startsWith: 'demo-' } },
      select: { id: true },
    });
    const userId = { in: demo.map((d) => d.id) };

    const result = await seedDemoReviews('안준형');
    expect(result.localVisits).toBeGreaterThan(12 * 5 - 1);
    // 가짜 탐험가의 별점 남긴 방문마다 리뷰 하나, 내 계정의 가짜 방문에는 리뷰를 만들지 않는다
    expect(result.reviews).toBe(await prisma.visit.count({ where: { userId, status: 'C' } }));
    expect(await prisma.review.count({ where: { userId: me.id } })).toBe(0);
    const reviews = await prisma.review.findMany({ where: { userId } });
    expect(reviews.every((r) => r.aiCheckedAt !== null)).toBe(true);
    expect(reviews.some((r) => r.content !== null && r.cleanliness !== null)).toBe(true);
    expect(reviews.some((r) => r.isRevisit)).toBe(true);
    for (const r of reviews) {
      expect(r.overallScore.toNumber()).toBeGreaterThanOrEqual(1);
      expect(r.overallScore.toNumber()).toBeLessThanOrEqual(5);
    }
    // 내 동네(가양동) 추천: 현지인 방문이 있는 가게가 보인다
    const reco = await request(app)
      .get('/api/v1/recommendations')
      .query({ type: 'LOCAL_POPULAR' })
      .set('Authorization', bearer(me.id));
    expect(reco.status).toBe(200);
    expect(reco.body.data.items.length).toBeGreaterThan(0);
    // 끊겼다가 다시 돌려도 이어서 한다: 동네 가게는 다시 채우지 않고, 리뷰가 빠진 방문에만 다시 쓴다
    const total = await prisma.review.count({ where: { userId } });
    const dropped = await prisma.review.findMany({
      where: { userId },
      take: 30,
      select: { id: true },
    });
    const droppedIds = { in: dropped.map((r) => r.id) };
    await prisma.reviewAspectMark.deleteMany({ where: { reviewId: droppedIds } });
    await prisma.review.deleteMany({ where: { id: droppedIds } });
    const again = await seedDemoReviews('안준형');
    expect(again).toMatchObject({ localVisits: 0, reviews: 30, totalReviews: total });
    expect(await seedDemoReviews('안준형')).toMatchObject({ localVisits: 0, reviews: 0 });

    await clearDemoData('안준형');
    expect(await prisma.review.count()).toBe(0);
    expect(await prisma.reviewAspectMark.count()).toBe(0);
    // 가게 별점·방문 수는 진짜 기록만 남는다 (진짜 정복 3건 + 별점 대기 방문 1건 = 방문자 4)
    const stats = await prisma.restaurantStat.findMany();
    expect(stats.every((st) => st.reviewCount === 0 && st.localVisitCount === 0)).toBe(true);
    expect(stats.reduce((sum, st) => sum + st.visitorCount, 0)).toBe(4);
  }, 180_000);

  it('받은 먹포인트를 그사이 썼으면 0에서 멈추고, clear는 다시 돌려도 되며 가짜 탐험가 닉네임은 받지 않는다', async () => {
    const { me } = await setup();
    await seedDemoData('안준형');
    await expect(clearDemoData('떡볶이요정')).rejects.toThrow('회원이 없어요');
    expect(await prisma.member.count()).toBe(26);

    // 받은 보상보다 적게 남을 만큼 상점에서 썼다
    await prisma.member.update({ where: { id: me.id }, data: { pointBalance: 50 } });
    await clearDemoData('안준형');
    const after = await prisma.member.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.pointBalance).toBe(0);

    expect(await clearDemoData('안준형')).toEqual({
      members: 0,
      myConquests: 0,
      pointBack: 0,
      seasons: [],
    });
    expect(await prisma.member.count()).toBe(2);
    expect(await prisma.seasonResult.count()).toBe(0);
    await expect(clearDemoData('없는사람')).rejects.toThrow('회원이 없어요');
  }, 120_000);

  it('지난 시즌에 진짜 기록이 있거나 보상 아이템을 이미 가졌으면 아무것도 넣지 않는다', async () => {
    const { current, second, me, real, gangseoId } = await setup();
    await prisma.seasonRegionStat.create({
      data: { seasonId: second.id, sigunguId: gangseoId, userId: real.id, conquestCount: 1 },
    });
    await expect(seedDemoData('안준형')).rejects.toThrow('시즌 2에 이미 기록이 있어요');
    await prisma.seasonRegionStat.deleteMany({ where: { seasonId: second.id } });
    // 별점 대기 방문만 있어도 진짜 기록이다
    const pending = await createVisit(real.id, (await createRestaurant()).id, {
      seasonId: second.id,
      status: 'V',
    });
    await expect(seedDemoData('안준형')).rejects.toThrow('시즌 2에 이미 기록이 있어요');
    await prisma.visit.delete({ where: { id: pending.id } });

    const club = await prisma.item.findFirstOrThrow({ where: { category: 'CLUB' } });
    await prisma.memberItem.create({ data: { userId: me.id, itemId: club.id, acquiredType: 'S' } });
    await expect(seedDemoData('안준형')).rejects.toThrow('보상 아이템을 이미 가지고 있어요');
    await expect(seedDemoData('없는사람')).rejects.toThrow('회원이 없어요');
    await prisma.memberItem.deleteMany({ where: { userId: me.id } });
    await prisma.season.update({ where: { id: current.id }, data: { status: 'E' } });
    await expect(seedDemoData('안준형')).rejects.toThrow('진행 중인 시즌이 없어요');
    expect(await prisma.member.count()).toBe(2);
    expect(await prisma.conquest.count()).toBe(3);
    expect(await prisma.seasonResult.count()).toBe(0);
  });
});
