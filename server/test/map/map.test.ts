import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from '../helpers/db';
import {
  agreeConsents,
  bearer,
  createActiveSeason,
  createConquest,
  createMember,
  createPastSeason,
  createRestaurant,
  createVisit,
} from '../helpers/fixtures';
import { stubKakao } from '../helpers/kakao';

const app = createApp();

const GAYANG = '1150010400'; // 강서구 가양동

// 가양동 중심(37.5664, 126.8447) 둘레, 대각선 약 1.9km
const BOUNDS = { swLat: '37.5600', swLng: '126.8380', neLat: '37.5730', neLng: '126.8520' };
const CENTER = { lat: 37.5665, lng: 126.845 };

async function region(code: string) {
  return prisma.region.findUniqueOrThrow({ where: { code } });
}

async function getMap(userId: bigint, query: Record<string, string> = BOUNDS) {
  return request(app)
    .get('/api/v1/map/restaurants')
    .query(query)
    .set('Authorization', bearer(userId));
}

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MAP-01 GET /map/restaurants — 조회·필터', () => {
  let fetchMock: ReturnType<typeof stubKakao>;
  beforeEach(() => {
    fetchMock = stubKakao();
  });

  it('DB 가게만 보고 카카오는 부르지 않는다 (카카오 결과는 저장할 수 없다)', async () => {
    const me = await createMember();
    await createRestaurant({ name: '공공데이터가게', lat: 37.5665, lng: 126.845 });
    const res = await getMap(me.id);
    expect(res.status).toBe(200);
    expect(res.body.data.items.map((i: { name: string }) => i.name)).toEqual(['공공데이터가게']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('서울 밖 영역이면 빈 목록', async () => {
    const me = await createMember();
    const res = await getMap(me.id, {
      swLat: '35.1500',
      swLng: '129.0500',
      neLat: '35.1600',
      neLng: '129.0600',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ items: [], totalCount: 0, truncated: false });
  });

  it('영역 안 영업 중 가게만, 내 정복 상태·저장 여부를 붙여 준다', async () => {
    const season = await createActiveSeason(2);
    const past = await createPastSeason(1);
    const me = await createMember();
    const other = await createMember();

    const conquered = await createRestaurant({ name: '정복', lat: 37.5665, lng: 126.845 });
    const moving = await createRestaurant({ name: '이동중', lat: 37.5666, lng: 126.845 });
    const pastOnly = await createRestaurant({ name: '지난시즌', lat: 37.5667, lng: 126.845 });
    const savedOne = await createRestaurant({ name: '저장', lat: 37.5668, lng: 126.845 });
    const othersConquest = await createRestaurant({ name: '남이정복', lat: 37.5669, lng: 126.845 });
    await createRestaurant({ name: '폐업', status: 'C', lat: 37.566, lng: 126.845 });
    await createRestaurant({ name: '숨김', status: 'H', lat: 37.566, lng: 126.845 });
    await createRestaurant({ name: '영역밖', lat: 37.58, lng: 126.845 });

    await createConquest(me.id, conquered, season.id);
    await createVisit(me.id, moving.id, { status: 'V' });
    await createConquest(me.id, pastOnly, past.id);
    await prisma.savedRestaurant.create({ data: { userId: me.id, restaurantId: savedOne.id } });
    await createConquest(other.id, othersConquest, season.id);

    const res = await getMap(me.id);
    const byName = Object.fromEntries(
      res.body.data.items.map((i: { name: string }) => [i.name, i]),
    );
    expect(Object.keys(byName).sort()).toEqual(['남이정복', '이동중', '저장', '정복', '지난시즌']);
    expect(byName['정복']).toMatchObject({
      conquestState: 'CONQUERED',
      conqueredInPastSeason: false,
    });
    expect(byName['이동중']).toMatchObject({ conquestState: 'MOVING' });
    expect(byName['지난시즌']).toMatchObject({
      conquestState: 'NOT_CONQUERED',
      conqueredInPastSeason: true,
    });
    expect(byName['저장']).toMatchObject({ conquestState: 'NOT_CONQUERED', isSaved: true });
    expect(byName['남이정복']).toMatchObject({ conquestState: 'NOT_CONQUERED' });
  });

  it('conquestState로 정복한 곳 / 아직 정복 안 한 곳(이동 중 포함)만 볼 수 있다', async () => {
    const season = await createActiveSeason();
    const me = await createMember();
    const conquered = await createRestaurant({ name: '정복', lat: 37.5665, lng: 126.845 });
    const moving = await createRestaurant({ name: '이동중', lat: 37.5666, lng: 126.845 });
    await createRestaurant({ name: '미정복', lat: 37.5667, lng: 126.845 });
    await createConquest(me.id, conquered, season.id);
    await createVisit(me.id, moving.id, { status: 'V' });

    const names = async (conquestState: string) =>
      (await getMap(me.id, { ...BOUNDS, conquestState })).body.data.items
        .map((i: { name: string }) => i.name)
        .sort();
    expect(await names('CONQUERED')).toEqual(['정복']);
    expect(await names('NOT_CONQUERED')).toEqual(['미정복', '이동중']);
  });

  it('mineOnly=true면 내가 찜한 곳·정복한 곳(지난 시즌·이동 중 포함)만 준다', async () => {
    const season = await createActiveSeason(2);
    const past = await createPastSeason(1);
    const me = await createMember();
    const other = await createMember();
    const conquered = await createRestaurant({ name: '정복', lat: 37.5665, lng: 126.845 });
    const moving = await createRestaurant({ name: '이동중', lat: 37.5666, lng: 126.845 });
    const pastOnly = await createRestaurant({ name: '지난시즌', lat: 37.5667, lng: 126.845 });
    const savedOne = await createRestaurant({ name: '저장', lat: 37.5668, lng: 126.845 });
    const othersOne = await createRestaurant({ name: '남이찜', lat: 37.5669, lng: 126.845 });
    await createRestaurant({ name: '아무도안감', lat: 37.567, lng: 126.845 });
    await createConquest(me.id, conquered, season.id);
    await createVisit(me.id, moving.id, { status: 'V' });
    await createConquest(me.id, pastOnly, past.id);
    await prisma.savedRestaurant.create({ data: { userId: me.id, restaurantId: savedOne.id } });
    await prisma.savedRestaurant.create({ data: { userId: other.id, restaurantId: othersOne.id } });
    await createConquest(other.id, othersOne, season.id);

    const res = await getMap(me.id, { ...BOUNDS, mineOnly: 'true' });

    expect(res.status).toBe(200);
    expect(res.body.data.items.map((i: { name: string }) => i.name).sort()).toEqual([
      '이동중',
      '저장',
      '정복',
      '지난시즌',
    ]);
  });

  it('이번 시즌에 정복한 가게라도 별점 대기 방문이 있으면 이동 중이라 NOT_CONQUERED 쪽에 나온다', async () => {
    const season = await createActiveSeason();
    const me = await createMember();
    const again = await createRestaurant({ name: '다시방문', lat: 37.5665, lng: 126.845 });
    await createConquest(me.id, again, season.id);
    await createVisit(me.id, again.id, { status: 'V', seasonId: season.id });

    const conquered = await getMap(me.id, { ...BOUNDS, conquestState: 'CONQUERED' });
    const notConquered = await getMap(me.id, { ...BOUNDS, conquestState: 'NOT_CONQUERED' });

    expect(conquered.body.data.items).toEqual([]);
    expect(notConquered.body.data.items).toEqual([
      expect.objectContaining({ name: '다시방문', conquestState: 'MOVING' }),
    ]);
  });

  it('진행 중 시즌이 없으면 정복한 곳 필터는 빈 목록', async () => {
    const me = await createMember();
    await createRestaurant({ lat: 37.5665, lng: 126.845 });
    const res = await getMap(me.id, { ...BOUNDS, conquestState: 'CONQUERED' });
    expect(res.body.data.items).toEqual([]);
    const all = await getMap(me.id, { ...BOUNDS, conquestState: 'NOT_CONQUERED' });
    expect(all.body.data.items).toHaveLength(1);
  });

  it('categoryId로 거른다', async () => {
    const me = await createMember();
    await createRestaurant({ name: '한식', categoryId: 1, lat: 37.5665, lng: 126.845 });
    await createRestaurant({ name: '카페', categoryId: 11, lat: 37.5666, lng: 126.845 });
    const res = await getMap(me.id, { ...BOUNDS, categoryId: '11' });
    expect(res.body.data.items.map((i: { name: string }) => i.name)).toEqual(['카페']);
  });

  it('300개를 넘으면 가까운 300개만 주고 truncated = true', async () => {
    const me = await createMember();
    const gayang = await region(GAYANG);
    await prisma.restaurant.createMany({
      data: Array.from({ length: 301 }, (_, i) => ({
        kakaoPlaceId: `bulk-${i}`,
        name: `가게${i}`,
        categoryId: 1,
        regionId: gayang.id,
        sigunguId: gayang.parentId ?? 0,
        lat: CENTER.lat + i * 0.00001,
        lng: CENTER.lng,
      })),
    });
    const res = await getMap(me.id);
    expect(res.body.data.items).toHaveLength(300);
    expect(res.body.data.totalCount).toBe(300);
    expect(res.body.data.truncated).toBe(true);
    expect(res.body.data.items.some((i: { name: string }) => i.name === '가게300')).toBe(false);
  });
});

describe('MAP-01 GET /map/restaurants — 입력 검증', () => {
  beforeEach(() => {
    stubKakao();
  });

  it.each([
    [{ ...BOUNDS, swLat: undefined }, 'INVALID_MAP_BOUNDS', '지도 영역 값이 올바르지 않아요.'],
    [{ ...BOUNDS, neLng: 'abc' }, 'INVALID_MAP_BOUNDS', undefined],
    [{ ...BOUNDS, swLat: '91' }, 'INVALID_MAP_BOUNDS', undefined],
    [{ ...BOUNDS, swLat: '37.5800' }, 'INVALID_MAP_BOUNDS', undefined],
    [{ ...BOUNDS, swLng: '126.8600' }, 'INVALID_MAP_BOUNDS', undefined],
    [{ ...BOUNDS, neLat: '37.6000' }, 'MAP_BOUNDS_TOO_LARGE', '지도를 더 확대해 주세요.'],
    [{ ...BOUNDS, categoryId: '99' }, 'INVALID_CATEGORY', '없는 카테고리예요.'],
    [{ ...BOUNDS, categoryId: 'abc' }, 'INVALID_CATEGORY', undefined],
    [{ ...BOUNDS, conquestState: 'MOVING' }, 'VALIDATION_ERROR', undefined],
    [{ ...BOUNDS, mineOnly: 'yes' }, 'VALIDATION_ERROR', undefined],
  ])('400 %j → %s', async (query, code, message) => {
    const me = await createMember();
    const clean = Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== undefined),
    ) as Record<string, string>;
    const res = await getMap(me.id, clean);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(code);
    if (message) expect(res.body.message).toBe(message);
  });

  it('프로필 설정 전이면 403 PROFILE_REQUIRED', async () => {
    const me = await createMember({ status: 'P', nickname: null });
    await agreeConsents(me.id);
    const res = await getMap(me.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PROFILE_REQUIRED');
  });
});
