import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { addDays, kstTodayAsDbDate } from '../../src/common/time';
import { prisma } from '../../src/lib/prisma';
import { runSeasonJob } from '../../src/modules/ranking/season-job';
import { resetDb } from '../helpers/db';
import { bearer, createActiveSeason, createMember } from '../helpers/fixtures';
import { conquerMany } from '../helpers/game';

const app = createApp();
const get = (userId: bigint, path: string) =>
  request(app).get(`/api/v1${path}`).set('Authorization', bearer(userId));

beforeEach(async () => {
  await resetDb();
});

async function gangseo() {
  return prisma.region.findUniqueOrThrow({ where: { code: '1150000000' } });
}

describe('RANK-01·02 시즌', () => {
  it('현재 시즌과 D-n, 시즌 목록(예정 제외)', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    const res = await get(me.id, '/seasons/current');
    expect(res.body.data).toMatchObject({
      seasonId: season.id,
      seasonNo: 3,
      name: '시즌 3',
      daysLeft: 40,
    });
    await prisma.season.create({
      data: {
        seasonNo: 4,
        startDate: addDays(kstTodayAsDbDate(), 41),
        endDate: addDays(kstTodayAsDbDate(), 200),
      },
    });
    expect((await get(me.id, '/seasons')).body.data.items).toHaveLength(1);
  });
});

describe('RANK-03~07 현황·랭킹', () => {
  it('구별 현황(내 동네 구 먼저), 구 상세, TOP 50, 먹짱 지도, 구 배경', async () => {
    const season = await createActiveSeason(3);
    const gu = await gangseo();
    const me = await createMember({ nickname: '아기깨비' });
    const king = await createMember({ nickname: '동네미식가' });
    const dong = await prisma.region.findUniqueOrThrow({ where: { code: '1150010400' } });
    await prisma.memberLocalRegion.create({
      data: { userId: me.id, regionId: dong.id, sigunguId: gu.id, sortOrder: 0 },
    });
    await conquerMany(king.id, season.id, 7);
    await conquerMany(me.id, season.id, 5);

    const list = await get(me.id, '/users/me/conquests/sigungus');
    expect(list.body.data).toMatchObject({ totalConquestCount: 5, sigunguCount: 1 });
    expect(list.body.data.items[0]).toMatchObject({
      sigunguName: '강서구',
      isLocal: true,
      conquestCount: 5,
      rank: 2,
      tier: 'REGULAR',
      tierTitle: '강서구 단골',
      activeExplorerCount: 2,
      nextTier: { tierName: '미식가', remaining: 15 },
    });

    const detail = await get(me.id, `/users/me/conquests/sigungus/${gu.id}`);
    expect(detail.body.data).toMatchObject({
      rank: 2,
      mukjjangGap: 3,
      tierProgress: { current: 5, nextTierAt: 20 },
    });
    expect(detail.body.data.restaurants.totalCount).toBe(5);
    expect(detail.body.data.rankingPreview.map((r: { rank: number }) => r.rank)).toEqual([1, 2]);

    const top = await get(me.id, `/rankings/sigungus/${gu.id}`);
    expect(top.body.data.items.map((i: { nickname: string }) => i.nickname)).toEqual([
      '동네미식가',
      '아기깨비',
    ]);
    expect(top.body.data.myRank).toMatchObject({ rank: 2, mukjjangGap: 3 });

    const map = await get(me.id, '/rankings/mukjjang-map');
    const gsItem = map.body.data.items.find((i: { sigunguId: number }) => i.sigunguId === gu.id);
    expect(map.body.data.items).toHaveLength(25);
    expect(gsItem).toMatchObject({
      mukjjang: { nickname: '동네미식가', conquestCount: 7 },
      myRank: 2,
    });
    const dongMap = await get(me.id, `/rankings/mukjjang-map?sigunguId=${gu.id}`);
    expect(dongMap.body.data.level).toBe('DONG');
    expect(
      dongMap.body.data.items.find((d: { regionId: number }) => d.regionId === dong.id).leader
        .nickname,
    ).toBe('동네미식가');

    const bg = await get(me.id, '/users/me/region-backgrounds');
    expect(
      bg.body.data.items.find((i: { sigunguId: number }) => i.sigunguId === gu.id),
    ).toMatchObject({
      conquestCount: 5,
      requiredCount: 10,
      unlocked: false,
    });
  });
});

describe('RANK-08·09·11 업적·칭호', () => {
  it('업적 진행도, 보유 칭호, 대표 칭호 바꾸기·해제', async () => {
    const season = await createActiveSeason(3);
    const me = await createMember();
    await conquerMany(me.id, season.id, 5);

    const achievements = await get(me.id, '/users/me/achievements');
    const items = achievements.body.data.items as {
      code: string;
      achieved: boolean;
      progress: { current: number };
    }[];
    expect(items).toHaveLength(12);
    expect(items.find((a) => a.code === 'FIRST_CONQUEST')?.achieved).toBe(true);
    expect(items.find((a) => a.code === 'DISTRICT_3')?.progress.current).toBe(1);
    expect(achievements.body.data.representativeTitle).toBe('강서구의 먹짱');

    const titles = await get(me.id, '/users/me/titles');
    const first = (titles.body.data.items as { type: string; refId: number; title: string }[]).find(
      (t) => t.title === '첫 정복',
    );
    expect(first).toBeDefined();
    const set = await request(app)
      .patch('/api/v1/users/me/representative-title')
      .set('Authorization', bearer(me.id))
      .send({ type: 'ACHIEVEMENT', refId: first?.refId });
    expect(set.body.data).toMatchObject({ representativeTitle: '첫 정복', isAuto: false });

    const notOwned = await request(app)
      .patch('/api/v1/users/me/representative-title')
      .set('Authorization', bearer(me.id))
      .send({ type: 'ACHIEVEMENT', refId: 9999 });
    expect(notOwned.body.code).toBe('TITLE_NOT_OWNED');

    const reset = await request(app)
      .patch('/api/v1/users/me/representative-title')
      .set('Authorization', bearer(me.id))
      .send({ type: null });
    expect(reset.body.data).toMatchObject({ representativeTitle: '강서구의 먹짱', isAuto: true });
  });
});

describe('시즌 배치 · RANK-10 시즌 기록', () => {
  it('끝난 시즌을 확정하고 보상(먹포인트·방망이·왕관·밤하늘)·업적·알림, 다음 시즌을 연다', async () => {
    const today = kstTodayAsDbDate();
    const season = await prisma.season.create({
      data: {
        seasonNo: 3,
        startDate: addDays(today, -100),
        endDate: addDays(today, -1),
        status: 'A',
      },
    });
    const king = await createMember();
    const others = await Promise.all([1, 2, 3].map(() => createMember()));
    await conquerMany(king.id, season.id, 6);
    for (const o of others) await conquerMany(o.id, season.id, 1);

    const result = await runSeasonJob();
    expect(result.finalized[0]).toMatchObject({ seasonNo: 3, finalized: true, members: 4 });
    expect(result.opened).toBe(4);
    expect((await prisma.season.findUniqueOrThrow({ where: { id: season.id } })).status).toBe('F');

    const kingResult = await prisma.seasonResult.findFirstOrThrow({ where: { userId: king.id } });
    expect(kingResult).toMatchObject({ bestRankNo: 1, bestTier: 'M', rewardPoint: 300 });
    const kingItems = await prisma.memberItem.findMany({
      where: { userId: king.id },
      include: { item: true },
    });
    expect(kingItems.map((i) => i.item.code).sort()).toEqual([
      'CLUB_GOLD',
      'HAT_CROWN',
      'SKIN_NIGHTSKY',
    ]);
    const codes = (
      await prisma.memberAchievement.findMany({
        where: { userId: king.id },
        include: { achievement: true },
      })
    ).map((a) => a.achievement.code);
    expect(codes).toEqual(expect.arrayContaining(['MUKJJANG', 'SEASON_TOP10']));
    const last = others[2];
    const lastItems = await prisma.memberItem.findMany({
      where: { userId: last.id },
      include: { item: true },
    });
    expect(lastItems.map((i) => i.item.code)).toEqual(['CLUB_WOOD']);

    const records = await get(king.id, '/users/me/season-records');
    expect(records.body.data.records[0]).toMatchObject({
      tier: 'MUKJJANG',
      rank: 1,
      rewardClubItem: { code: 'CLUB_GOLD' },
    });
    expect(records.body.data.current.season.seasonNo).toBe(4);

    // 다시 돌려도 결과가 두 번 생기지 않는다
    await runSeasonJob();
    expect(await prisma.seasonResult.count({ where: { userId: king.id } })).toBe(1);
  });
});
