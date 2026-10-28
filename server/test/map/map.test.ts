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
import { kakaoCalls, kakaoPlace, stubKakao } from '../helpers/kakao';

const app = createApp();

const GAYANG = '1150010400'; // 강서구 가양동
const DEUNGCHON = '1150010200'; // 강서구 등촌동

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

describe('MAP-01 GET /map/restaurants — 카카오 가게 저장', () => {
  it('카카오 음식점(FD6)·카페(CE7)를 영역으로 불러 없는 가게를 저장한다', async () => {
    const fetchMock = stubKakao({
      category: (params) =>
        params.get('category_group_code') === 'FD6'
          ? [
              kakaoPlace({
                id: '1001',
                place_name: '옛날손칼국수',
                category_name: '음식점 > 한식 > 국수 > 칼국수',
                x: '126.8450',
                y: '37.5665',
              }),
              kakaoPlace({
                id: '1002',
                place_name: '가양고기집',
                category_name: '음식점 > 한식 > 육류,고기 > 삼겹살',
                x: '126.8480',
                y: '37.5690',
                phone: '',
              }),
            ]
          : [
              kakaoPlace({
                id: '2001',
                place_name: '가양커피',
                category_name: '음식점 > 카페 > 커피전문점',
                category_group_code: 'CE7',
                x: '126.8400',
                y: '37.5620',
              }),
            ],
    });
    const me = await createMember();

    const res = await getMap(me.id);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('지도 음식점을 조회했어요.');
    expect(res.body.data.kakaoSynced).toBe(true);
    expect(res.body.data.truncated).toBe(false);
    expect(res.body.data.totalCount).toBe(3);
    // 화면 중심에서 가까운 순
    expect(res.body.data.items.map((i: { name: string }) => i.name)).toEqual([
      '옛날손칼국수',
      '가양고기집',
      '가양커피',
    ]);
    expect(res.body.data.items[0]).toEqual({
      restaurantId: expect.any(Number),
      name: '옛날손칼국수',
      categoryId: 1,
      categoryName: '한식',
      lat: 37.5665,
      lng: 126.845,
      conquestState: 'NOT_CONQUERED',
      conqueredInPastSeason: false,
      isSaved: false,
    });

    const gayang = await region(GAYANG);
    const saved = await prisma.restaurant.findMany({ orderBy: { kakaoPlaceId: 'asc' } });
    expect(saved.map((r) => [r.kakaoPlaceId, r.categoryId, r.regionId, r.sigunguId])).toEqual([
      ['1001', 1, gayang.id, gayang.parentId],
      ['1002', 6, gayang.id, gayang.parentId],
      ['2001', 11, gayang.id, gayang.parentId],
    ]);
    expect(saved[0]).toMatchObject({
      kakaoCategoryName: '음식점 > 한식 > 국수 > 칼국수',
      phone: '02-1234-5678',
      roadAddress: '서울 강서구 가양로 123',
      jibunAddress: '서울 강서구 가양동 1487',
      status: 'A',
    });
    expect(saved[1].phone).toBeNull();

    // 카카오 요청: 그룹마다 한 번, rect는 화면을 소수점 3자리 격자로 넓힌 사각형 (서,남,동,북)
    const calls = kakaoCalls(fetchMock, '/v2/local/search/category.json');
    expect(calls.map((p) => p.get('category_group_code')).sort()).toEqual(['CE7', 'FD6']);
    expect(calls[0].get('rect')).toBe('126.838,37.56,126.852,37.573');
    expect(calls[0].get('size')).toBe('15');
    expect(calls[0].get('page')).toBe('1');
  });

  it('지번 주소로 동을 못 찾으면 좌표로 찾고, 서울이 아니면 저장하지 않는다', async () => {
    const fetchMock = stubKakao({
      category: (params) =>
        params.get('category_group_code') === 'FD6'
          ? [
              kakaoPlace({ id: '1', address_name: '', x: '126.8450', y: '37.5665' }),
              kakaoPlace({
                id: '2',
                address_name: '경기 고양시 덕양구 화정동 1',
                x: '126.84',
                y: '37.57',
              }),
              kakaoPlace({
                id: '3',
                address_name: '서울 강서구 없는동 1',
                x: '126.8451',
                y: '37.5666',
              }),
            ]
          : [],
      coord2region: (params) => (params.get('x') === '126.8451' ? null : GAYANG),
    });
    const me = await createMember();

    await getMap(me.id);

    const saved = await prisma.restaurant.findMany({ select: { kakaoPlaceId: true } });
    expect(saved.map((r) => r.kakaoPlaceId)).toEqual(['1']);
    // 경기 주소는 좌표 변환도 부르지 않는다
    expect(kakaoCalls(fetchMock, '/v2/local/geo/coord2regioncode.json')).toHaveLength(2);
  });

  it('이미 있는 가게는 이름·전화·주소·좌표만 바꾸고 카테고리·동·상태는 그대로 둔다', async () => {
    const deungchon = await region(DEUNGCHON);
    const existing = await createRestaurant({
      kakaoPlaceId: '1001',
      name: '옛 이름',
      categoryId: 12,
      dongCode: DEUNGCHON,
      lat: 37.5665,
      lng: 126.845,
    });
    stubKakao({
      category: (params) =>
        params.get('category_group_code') === 'FD6'
          ? [kakaoPlace({ id: '1001', place_name: '새 이름', x: '126.8460', y: '37.5670' })]
          : [],
    });
    const me = await createMember();

    await getMap(me.id);

    const updated = await prisma.restaurant.findUniqueOrThrow({ where: { id: existing.id } });
    expect(updated).toMatchObject({
      name: '새 이름',
      phone: '02-1234-5678',
      jibunAddress: '서울 강서구 가양동 1487',
      categoryId: 12,
      regionId: deungchon.id,
      status: 'A',
    });
    expect(updated.lat.toNumber()).toBe(37.567);
    expect(updated.lng.toNumber()).toBe(126.846);
  });

  it('같은 영역은 24시간 동안 카카오를 다시 부르지 않는다', async () => {
    const fetchMock = stubKakao();
    const me = await createMember();

    await getMap(me.id);
    // 소수점 3자리 격자가 같으면 같은 영역
    const again = await getMap(me.id, { ...BOUNDS, swLat: '37.5601' });
    expect(again.body.data.kakaoSynced).toBe(true);
    expect(kakaoCalls(fetchMock, '/v2/local/search/category.json')).toHaveLength(2);

    await getMap(me.id, { ...BOUNDS, swLat: '37.5590' });
    expect(kakaoCalls(fetchMock, '/v2/local/search/category.json')).toHaveLength(4);
  });

  it('카카오가 실패해도 에러 없이 DB 결과만 주고(kakaoSynced false), 다음 요청에 다시 부른다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = stubKakao({ category: () => 500 });
    await createRestaurant({ name: 'DB가게', lat: 37.5665, lng: 126.845 });
    const me = await createMember();

    const res = await getMap(me.id);
    expect(res.status).toBe(200);
    expect(res.body.data.kakaoSynced).toBe(false);
    expect(res.body.data.items.map((i: { name: string }) => i.name)).toEqual(['DB가게']);

    await getMap(me.id);
    expect(kakaoCalls(fetchMock, '/v2/local/search/category.json').length).toBeGreaterThan(2);
  });

  it('서울 밖 영역이면 카카오를 부르지 않고 빈 목록', async () => {
    const fetchMock = stubKakao();
    const me = await createMember();
    const res = await getMap(me.id, {
      swLat: '35.1500',
      swLng: '129.0500',
      neLat: '35.1600',
      neLng: '129.0600',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      items: [],
      totalCount: 0,
      truncated: false,
      kakaoSynced: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('MAP-01 GET /map/restaurants — 조회·필터', () => {
  beforeEach(() => {
    stubKakao();
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
