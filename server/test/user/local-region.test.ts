import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { addDays, formatDbDate, kstTodayAsDbDate } from '../../src/common/time';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from '../helpers/db';
import { agreeConsents, bearer, createMember } from '../helpers/fixtures';

const app = createApp();

const GAYANG = '1150010400'; // 강서구 가양동
const YEOKSAM = '1168010100'; // 강남구 역삼동
const SINDANG = '1114016200'; // 중구 신당동
const EULJIRO1 = '1114010400'; // 중구 을지로1가
const GANGSEO = '1150000000'; // 강서구

async function region(code: string) {
  return prisma.region.findUniqueOrThrow({ where: { code } });
}

/** 내 동네를 sortOrder 순서대로 넣는다 (회원가입 때 고른 것처럼 local_changed_at은 건드리지 않는다) */
async function giveLocalRegions(userId: bigint, codes: string[]) {
  for (const [sortOrder, code] of codes.entries()) {
    const dong = await region(code);
    await prisma.memberLocalRegion.create({
      data: { userId, regionId: dong.id, sigunguId: dong.parentId ?? 0, sortOrder },
    });
  }
}

/** 오늘을 포함하는 진행 중 시즌 */
async function createActiveSeason() {
  const today = kstTodayAsDbDate();
  return prisma.season.create({
    data: { seasonNo: 1, startDate: addDays(today, -20), endDate: addDays(today, 40), status: 'A' },
  });
}

function nextDayText(endDate: Date) {
  const next = addDays(endDate, 1);
  return `${next.getUTCMonth() + 1}월 ${next.getUTCDate()}일`;
}

beforeEach(async () => {
  await resetDb();
});

describe('LOCAL-01 GET /users/me/local-regions', () => {
  it('내 동네를 순서대로 주고, 이번 시즌에 안 바꿨으면 canChange true', async () => {
    await createActiveSeason();
    const me = await createMember();
    await giveLocalRegions(me.id, [YEOKSAM, GAYANG]);

    const res = await request(app)
      .get('/api/v1/users/me/local-regions')
      .set('Authorization', bearer(me.id));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('내 동네를 조회했어요.');
    const gangseo = await region(GANGSEO);
    expect(res.body.data).toEqual({
      items: [
        expect.objectContaining({ dongName: '역삼동', sigunguName: '강남구', sortOrder: 0 }),
        {
          localRegionId: expect.any(Number),
          regionId: (await region(GAYANG)).id,
          dongName: '가양동',
          sigunguId: gangseo.id,
          sigunguName: '강서구',
          sortOrder: 1,
          regDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/),
        },
      ],
      minCount: 1,
      maxCount: 3,
      canChange: true,
      nextChangeAvailableAt: null,
    });
  });

  it('이번 시즌에 바꿨으면 canChange false, 다음 시즌 시작일을 준다', async () => {
    const season = await createActiveSeason();
    const me = await createMember({ localChangedAt: new Date() });
    await giveLocalRegions(me.id, [GAYANG]);

    const res = await request(app)
      .get('/api/v1/users/me/local-regions')
      .set('Authorization', bearer(me.id));
    expect(res.body.data.canChange).toBe(false);
    expect(res.body.data.nextChangeAvailableAt).toBe(formatDbDate(addDays(season.endDate, 1)));
  });

  it('지난 시즌에 바꾼 것은 세지 않는다', async () => {
    const season = await createActiveSeason();
    // 시즌 시작(KST 0시) 1분 전
    const beforeStart = new Date(season.startDate.getTime() - 9 * 60 * 60 * 1000 - 60 * 1000);
    const me = await createMember({ localChangedAt: beforeStart });
    await giveLocalRegions(me.id, [GAYANG]);

    const res = await request(app)
      .get('/api/v1/users/me/local-regions')
      .set('Authorization', bearer(me.id));
    expect(res.body.data.canChange).toBe(true);
  });

  it('진행 중 시즌이 없으면 제한하지 않는다', async () => {
    const me = await createMember({ localChangedAt: new Date() });
    const res = await request(app)
      .get('/api/v1/users/me/local-regions')
      .set('Authorization', bearer(me.id));
    expect(res.body.data).toMatchObject({
      items: [],
      canChange: true,
      nextChangeAvailableAt: null,
    });
  });

  it('프로필 설정 전이면 403 PROFILE_REQUIRED', async () => {
    const me = await createMember({ status: 'P', nickname: null });
    await agreeConsents(me.id);
    const res = await request(app)
      .get('/api/v1/users/me/local-regions')
      .set('Authorization', bearer(me.id));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PROFILE_REQUIRED');
  });
});

describe('LOCAL-02 POST /users/me/local-regions', () => {
  async function add(userId: bigint, body: unknown) {
    return request(app)
      .post('/api/v1/users/me/local-regions')
      .set('Authorization', bearer(userId))
      .send(body as object);
  }

  it('맨 뒤에 추가하고 이번 시즌 변경으로 기록한다', async () => {
    const season = await createActiveSeason();
    const me = await createMember();
    await giveLocalRegions(me.id, [GAYANG]);
    const sindang = await region(SINDANG);

    const res = await add(me.id, { regionId: sindang.id });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('중구 신당동을 내 동네에 추가했어요.');
    expect(res.body.data.added).toMatchObject({
      regionId: sindang.id,
      dongName: '신당동',
      sigunguName: '중구',
      sortOrder: 1,
    });
    expect(res.body.data.items.map((i: { dongName: string }) => i.dongName)).toEqual([
      '가양동',
      '신당동',
    ]);
    expect(res.body.data.canChange).toBe(false);
    expect(res.body.data.nextChangeAvailableAt).toBe(formatDbDate(addDays(season.endDate, 1)));

    const member = await prisma.member.findUniqueOrThrow({ where: { id: me.id } });
    expect(member.localChangedAt).not.toBeNull();
  });

  it('받침이 없으면 "를"을 붙인다', async () => {
    const me = await createMember();
    await giveLocalRegions(me.id, [GAYANG]);
    const res = await add(me.id, { regionId: (await region(EULJIRO1)).id });
    expect(res.body.message).toBe('중구 을지로1가를 내 동네에 추가했어요.');
  });

  it('이번 시즌에 이미 바꿨으면 409 LOCAL_REGION_CHANGE_LIMITED', async () => {
    const season = await createActiveSeason();
    const me = await createMember();
    await giveLocalRegions(me.id, [GAYANG]);
    expect((await add(me.id, { regionId: (await region(SINDANG)).id })).status).toBe(201);

    const res = await add(me.id, { regionId: (await region(YEOKSAM)).id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LOCAL_REGION_CHANGE_LIMITED');
    expect(res.body.message).toBe(
      `내 동네는 한 시즌에 한 번만 바꿀 수 있어요. (${nextDayText(season.endDate)}부터 가능)`,
    );
    expect(res.body.data).toEqual({
      nextChangeAvailableAt: formatDbDate(addDays(season.endDate, 1)),
    });
  });

  it('이미 내 동네면 409 LOCAL_REGION_DUPLICATE', async () => {
    const me = await createMember();
    await giveLocalRegions(me.id, [GAYANG]);
    const res = await add(me.id, { regionId: (await region(GAYANG)).id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LOCAL_REGION_DUPLICATE');
    expect(res.body.message).toBe('이미 내 동네에 있는 동네예요.');
  });

  it('이미 3곳이면 409 LOCAL_REGION_LIMIT_EXCEEDED', async () => {
    const me = await createMember();
    await giveLocalRegions(me.id, [GAYANG, YEOKSAM, SINDANG]);
    const res = await add(me.id, { regionId: (await region(EULJIRO1)).id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LOCAL_REGION_LIMIT_EXCEEDED');
    expect(res.body.message).toBe('내 동네는 최대 3곳까지 고를 수 있어요.');
  });

  it('동시에 두 번 보내도 한 번만 추가된다', async () => {
    await createActiveSeason();
    const me = await createMember();
    await giveLocalRegions(me.id, [GAYANG]);
    const results = await Promise.all([
      add(me.id, { regionId: (await region(SINDANG)).id }),
      add(me.id, { regionId: (await region(YEOKSAM)).id }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.memberLocalRegion.count({ where: { userId: me.id } })).toBe(2);
  });

  it.each([
    [{}, 400, 'REGION_ID_REQUIRED'],
    [{ regionId: 'abc' }, 400, 'REGION_ID_REQUIRED'],
    [{ regionId: 1.5 }, 400, 'REGION_ID_REQUIRED'],
    [{ regionId: 99_999_999 }, 404, 'REGION_NOT_FOUND'],
  ])('%j → %i %s', async (body, status, code) => {
    const me = await createMember();
    await giveLocalRegions(me.id, [GAYANG]);
    const res = await add(me.id, body);
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
  });

  it('구를 고르면 400 REGION_NOT_DONG', async () => {
    const me = await createMember();
    await giveLocalRegions(me.id, [GAYANG]);
    const res = await add(me.id, { regionId: (await region(GANGSEO)).id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REGION_NOT_DONG');
  });
});

describe('LOCAL-03 DELETE /users/me/local-regions/{localRegionId}', () => {
  async function remove(userId: bigint, localRegionId: bigint | string) {
    return request(app)
      .delete(`/api/v1/users/me/local-regions/${localRegionId}`)
      .set('Authorization', bearer(userId));
  }

  async function localRegionIdOf(userId: bigint, code: string) {
    const dong = await region(code);
    const row = await prisma.memberLocalRegion.findFirstOrThrow({
      where: { userId, regionId: dong.id },
    });
    return row.id;
  }

  it('지우고 남은 동네 순서를 0부터 다시 매긴다 (0번을 지우면 다음 동네가 기본)', async () => {
    const season = await createActiveSeason();
    const me = await createMember();
    await giveLocalRegions(me.id, [GAYANG, YEOKSAM, SINDANG]);

    const res = await remove(me.id, await localRegionIdOf(me.id, GAYANG));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('내 동네에서 뺐어요.');
    expect(
      res.body.data.items.map((i: { dongName: string; sortOrder: number }) => [
        i.dongName,
        i.sortOrder,
      ]),
    ).toEqual([
      ['역삼동', 0],
      ['신당동', 1],
    ]);
    expect(res.body.data.canChange).toBe(false);
    expect(res.body.data.nextChangeAvailableAt).toBe(formatDbDate(addDays(season.endDate, 1)));
  });

  it('가운데 동네를 지워도 순서가 이어진다', async () => {
    const me = await createMember();
    await giveLocalRegions(me.id, [GAYANG, YEOKSAM, SINDANG]);
    const res = await remove(me.id, await localRegionIdOf(me.id, YEOKSAM));
    const rows = await prisma.memberLocalRegion.findMany({
      where: { userId: me.id },
      orderBy: { sortOrder: 'asc' },
    });
    expect(res.status).toBe(200);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1]);
  });

  it('1곳만 남았으면 409 LOCAL_REGION_MIN_REQUIRED', async () => {
    const me = await createMember();
    await giveLocalRegions(me.id, [GAYANG]);
    const res = await remove(me.id, await localRegionIdOf(me.id, GAYANG));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LOCAL_REGION_MIN_REQUIRED');
    expect(res.body.message).toBe('내 동네는 최소 1곳 있어야 해요.');
  });

  it('이번 시즌에 이미 바꿨으면 409 LOCAL_REGION_CHANGE_LIMITED', async () => {
    await createActiveSeason();
    const me = await createMember({ localChangedAt: new Date() });
    await giveLocalRegions(me.id, [GAYANG, YEOKSAM]);
    const res = await remove(me.id, await localRegionIdOf(me.id, GAYANG));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LOCAL_REGION_CHANGE_LIMITED');
    expect(await prisma.memberLocalRegion.count({ where: { userId: me.id } })).toBe(2);
  });

  it('다른 회원의 동네거나 없으면 404 LOCAL_REGION_NOT_FOUND', async () => {
    const other = await createMember();
    await giveLocalRegions(other.id, [GAYANG, YEOKSAM]);
    const me = await createMember();
    await giveLocalRegions(me.id, [SINDANG, EULJIRO1]);

    const othersRow = await remove(me.id, await localRegionIdOf(other.id, GAYANG));
    expect(othersRow.status).toBe(404);
    expect(othersRow.body.code).toBe('LOCAL_REGION_NOT_FOUND');
    expect(othersRow.body.message).toBe('내 동네에서 찾을 수 없어요.');

    const none = await remove(me.id, '999999');
    expect(none.status).toBe(404);
    expect(none.body.code).toBe('LOCAL_REGION_NOT_FOUND');
  });

  it('id가 숫자가 아니면 400 VALIDATION_ERROR', async () => {
    const me = await createMember();
    const res = await remove(me.id, 'abc');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
