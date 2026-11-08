import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from '../helpers/db';
import {
  bearer,
  createActiveSeason,
  createConquest,
  createMember,
  createRestaurant,
  createVisit,
} from '../helpers/fixtures';
import { stubKakao } from '../helpers/kakao';

const app = createApp();

const GAYANG = '1150010400'; // 강서구 가양동
const DEUNGCHON = '1150010200'; // 강서구 등촌동
const SINDANG = '1114016200'; // 중구 신당동
const GANGSEO = '1150000000'; // 강서구

async function region(code: string) {
  return prisma.region.findUniqueOrThrow({ where: { code } });
}

/** 활성 회원 + 내 동네(0번 = 가양동) */
async function memberInGayang() {
  const me = await createMember();
  const gayang = await region(GAYANG);
  await prisma.memberLocalRegion.create({
    data: { userId: me.id, regionId: gayang.id, sigunguId: gayang.parentId ?? 0, sortOrder: 0 },
  });
  return me;
}

/** 영수증 메뉴가 있는 방문 인증 */
async function visitWithMenus(
  restaurantId: bigint,
  menus: string[],
  status: 'C' | 'V' | 'F' = 'C',
) {
  const visitor = await createMember();
  const visit = await createVisit(visitor.id, restaurantId, { status });
  await prisma.visitReceiptItem.createMany({
    data: menus.map((menuName) => ({ visitId: visit.id, menuName })),
  });
}

function stat(restaurantId: bigint, data: Record<string, number | null>) {
  return prisma.restaurantStat.create({ data: { restaurantId, ...data } });
}

function names(res: request.Response) {
  return res.body.data.items.map((i: { name: string }) => i.name);
}

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SEARCH-01 GET /search/home', () => {
  it('내 동네 0번 동과 카테고리 12개별 영업 중 가게 수(0곳 포함)', async () => {
    const me = await memberInGayang();
    await createRestaurant({ categoryId: 1 });
    await createRestaurant({ categoryId: 1 });
    await createRestaurant({ categoryId: 11 });
    await createRestaurant({ categoryId: 1, status: 'C' });
    await createRestaurant({ categoryId: 1, status: 'H' });
    await createRestaurant({ categoryId: 1, dongCode: DEUNGCHON });

    const res = await request(app).get('/api/v1/search/home').set('Authorization', bearer(me.id));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('검색 홈을 조회했어요.');
    const gayang = await region(GAYANG);
    expect(res.body.data.region).toEqual({
      regionId: gayang.id,
      dongName: '가양동',
      sigunguId: gayang.parentId,
      sigunguName: '강서구',
    });
    expect(res.body.data.categories).toHaveLength(12);
    expect(res.body.data.categories[0]).toEqual({
      categoryId: 1,
      name: '한식',
      restaurantCount: 2,
    });
    expect(res.body.data.categories[10]).toEqual({
      categoryId: 11,
      name: '카페·디저트',
      restaurantCount: 1,
    });
    expect(res.body.data.categories[11]).toEqual({
      categoryId: 12,
      name: '기타',
      restaurantCount: 0,
    });
  });

  it('regionId로 다른 동을 볼 수 있다', async () => {
    const me = await memberInGayang();
    await createRestaurant({ categoryId: 2, dongCode: SINDANG });
    const sindang = await region(SINDANG);
    const res = await request(app)
      .get('/api/v1/search/home')
      .query({ regionId: sindang.id })
      .set('Authorization', bearer(me.id));
    expect(res.body.data.region.dongName).toBe('신당동');
    expect(res.body.data.categories[1].restaurantCount).toBe(1);
  });

  it('구를 고르면 400 REGION_NOT_DONG, 없는 지역이면 404 REGION_NOT_FOUND', async () => {
    const me = await memberInGayang();
    const gu = await request(app)
      .get('/api/v1/search/home')
      .query({ regionId: (await region(GANGSEO)).id })
      .set('Authorization', bearer(me.id));
    expect(gu.status).toBe(400);
    expect(gu.body.code).toBe('REGION_NOT_DONG');

    const none = await request(app)
      .get('/api/v1/search/home')
      .query({ regionId: 99999999 })
      .set('Authorization', bearer(me.id));
    expect(none.status).toBe(404);
    expect(none.body.code).toBe('REGION_NOT_FOUND');
  });
});

describe('SEARCH-02 GET /restaurants/search', () => {
  async function search(userId: bigint, query: Record<string, string | number>) {
    return request(app)
      .get('/api/v1/restaurants/search')
      .query(query)
      .set('Authorization', bearer(userId));
  }

  it('가게 이름과 영수증 메뉴에서 찾는다 (메뉴는 가장 많이 나온 것)', async () => {
    stubKakao();
    const me = await memberInGayang();
    const byName = await createRestaurant({ name: '옛날손칼국수' });
    const byMenu = await createRestaurant({ name: '가양식당' });
    const failedVisitOnly = await createRestaurant({ name: '실패식당' });
    await createRestaurant({ name: '상관없는집' });
    await createRestaurant({ name: '등촌칼국수', dongCode: DEUNGCHON });
    await visitWithMenus(byMenu.id, ['들깨칼국수', '김밥']);
    await visitWithMenus(byMenu.id, ['들깨칼국수']);
    await visitWithMenus(byMenu.id, ['바지락칼국수'], 'V');
    await visitWithMenus(failedVisitOnly.id, ['칼국수'], 'F');
    await stat(byName.id, { localVisitCount: 5 });

    const res = await search(me.id, { keyword: '칼국수' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('검색 결과를 조회했어요.');
    const gayang = await region(GAYANG);
    expect(res.body.data).toMatchObject({
      keyword: '칼국수',
      region: { regionId: gayang.id, dongName: '가양동', sigunguName: '강서구' },
      scope: 'DONG',
      sort: 'LOCAL_POPULAR',
      page: 1,
      size: 20,
      totalCount: 2,
      hasNext: false,
      emptyGuide: null,
    });
    expect(res.body.data.items).toEqual([
      {
        restaurantId: Number(byName.id),
        name: '옛날손칼국수',
        categoryId: 1,
        categoryName: '한식',
        distanceM: null,
        rating: { score: null, reviewCount: 0 },
        myOverallScore: null,
        hasMapae: false,
        revisitRate: null,
        localVisitRate: null,
        conquestState: 'NOT_CONQUERED',
        matchedBy: 'NAME',
        matchedMenuName: null,
      },
      expect.objectContaining({
        name: '가양식당',
        matchedBy: 'MENU',
        matchedMenuName: '들깨칼국수',
      }),
    ]);
  });

  it('업종 소분류(공공데이터)로도 찾고, 카카오는 부르지 않는다 (카카오 결과는 저장할 수 없다)', async () => {
    const fetchMock = stubKakao();
    const me = await memberInGayang();
    await createRestaurant({ name: '명동교자 가양점', categoryDetail: '국수/칼국수' });
    await createRestaurant({ name: '가양김밥', categoryDetail: '김밥/만두/분식' });

    const res = await search(me.id, { keyword: '칼국수' });

    expect(names(res)).toEqual(['명동교자 가양점']);
    expect(res.body.data.items[0]).toMatchObject({ matchedBy: 'NAME', matchedMenuName: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('카테고리만으로 찾으면 matchedBy는 null', async () => {
    stubKakao();
    const me = await memberInGayang();
    await createRestaurant({ name: '한식집', categoryId: 1 });
    await createRestaurant({ name: '중식집', categoryId: 2 });
    const res = await search(me.id, { categoryId: 2 });
    expect(res.body.data.keyword).toBeNull();
    expect(res.body.data.items).toEqual([
      expect.objectContaining({ name: '중식집', matchedBy: null, matchedMenuName: null }),
    ]);
  });

  it('검색어와 카테고리를 같이 주면 둘 다 맞는 가게만', async () => {
    stubKakao();
    const me = await memberInGayang();
    await createRestaurant({ name: '가양짬뽕', categoryId: 2 });
    await createRestaurant({ name: '가양국밥', categoryId: 1 });
    const res = await search(me.id, { keyword: '가양', categoryId: 2 });
    expect(names(res)).toEqual(['가양짬뽕']);
  });

  it('scope SIGUNGU면 그 동이 속한 구 전체에서 찾는다', async () => {
    stubKakao();
    const me = await memberInGayang();
    await createRestaurant({ name: '가양칼국수' });
    await createRestaurant({ name: '등촌칼국수', dongCode: DEUNGCHON });
    await createRestaurant({ name: '신당칼국수', dongCode: SINDANG });
    const res = await search(me.id, { keyword: '칼국수', scope: 'SIGUNGU' });
    expect(names(res).sort()).toEqual(['가양칼국수', '등촌칼국수']);
  });

  it('LOCAL_POPULAR: 로컬 방문 → 리뷰 수 → id 순', async () => {
    stubKakao();
    const me = await memberInGayang();
    const a = await createRestaurant({ name: '국밥A' });
    const b = await createRestaurant({ name: '국밥B' });
    const c = await createRestaurant({ name: '국밥C' });
    await createRestaurant({ name: '국밥D' });
    await stat(a.id, { localVisitCount: 3, reviewCount: 1, visitCount: 4 });
    await stat(b.id, { localVisitCount: 3, reviewCount: 9, visitCount: 6 });
    await stat(c.id, { localVisitCount: 10, reviewCount: 0, visitCount: 10 });
    const res = await search(me.id, { keyword: '국밥' });
    expect(names(res)).toEqual(['국밥C', '국밥B', '국밥A', '국밥D']);
    expect(res.body.data.items[1]).toMatchObject({ localVisitRate: 50 });
  });

  it('REVISIT: 방문자 5명 이상을 재방문 % 순으로 먼저, 그 뒤에 나머지', async () => {
    stubKakao();
    const me = await memberInGayang();
    const small = await createRestaurant({ name: '국밥소수' }); // 2명 중 2명 = 100%
    const mid = await createRestaurant({ name: '국밥중간' }); // 10명 중 5명 = 50%
    const high = await createRestaurant({ name: '국밥높음' }); // 5명 중 4명 = 80%
    await createRestaurant({ name: '국밥없음' });
    await stat(small.id, { visitorCount: 2, revisitorCount: 2 });
    await stat(mid.id, { visitorCount: 10, revisitorCount: 5 });
    await stat(high.id, { visitorCount: 5, revisitorCount: 4 });
    const res = await search(me.id, { keyword: '국밥', sort: 'REVISIT' });
    expect(names(res)).toEqual(['국밥높음', '국밥중간', '국밥소수', '국밥없음']);
    expect(res.body.data.items[0].revisitRate).toBe(80);
  });

  it('DISTANCE: 내 위치에서 가까운 순, 위치가 없으면 400 LOCATION_REQUIRED', async () => {
    stubKakao();
    const me = await memberInGayang();
    await createRestaurant({ name: '국밥먼', lat: 37.575, lng: 126.83 });
    await createRestaurant({ name: '국밥가까운', lat: 37.5665, lng: 126.8448 });
    const res = await search(me.id, {
      keyword: '국밥',
      sort: 'DISTANCE',
      lat: '37.5664',
      lng: '126.8447',
    });
    expect(names(res)).toEqual(['국밥가까운', '국밥먼']);
    expect(res.body.data.items[0].distanceM).toBeLessThan(20);

    const noLocation = await search(me.id, { keyword: '국밥', sort: 'DISTANCE' });
    expect(noLocation.status).toBe(400);
    expect(noLocation.body.code).toBe('LOCATION_REQUIRED');
    expect(noLocation.body.message).toBe('가까운 순으로 보려면 위치가 필요해요.');
  });

  it('페이지를 나눠 준다', async () => {
    stubKakao();
    const me = await memberInGayang();
    for (let i = 0; i < 5; i += 1) await createRestaurant({ name: `국밥${i}` });
    const res = await search(me.id, { keyword: '국밥', page: 2, size: 2 });
    expect(res.body.data).toMatchObject({ page: 2, size: 2, totalCount: 5, hasNext: true });
    expect(names(res)).toEqual(['국밥2', '국밥3']);
  });

  it('결과가 없으면 구 전체 찾기 안내와 비슷한 메뉴를 준다', async () => {
    stubKakao();
    const me = await memberInGayang();
    const res = await search(me.id, { keyword: '마라탕' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("'마라탕' 맛집을 찾지 못했어요.");
    expect(res.body.data).toMatchObject({
      items: [],
      totalCount: 0,
      hasNext: false,
      emptyGuide: { canSearchSigungu: true, similarKeywords: ['마라샹궈', '훠궈'] },
    });

    const gu = await search(me.id, { keyword: '없는메뉴', scope: 'SIGUNGU' });
    expect(gu.body.data.emptyGuide).toEqual({ canSearchSigungu: false, similarKeywords: [] });

    const categoryOnly = await search(me.id, { categoryId: 7 });
    expect(categoryOnly.body.message).toBe("'해산물' 맛집을 찾지 못했어요.");
  });

  it('검색어의 %, _ 는 글자 그대로 찾는다', async () => {
    stubKakao();
    const me = await memberInGayang();
    await createRestaurant({ name: '아무가게' });
    await createRestaurant({ name: '100%국산' });
    expect(names(await search(me.id, { keyword: '%' }))).toEqual(['100%국산']);
    expect(names(await search(me.id, { keyword: '_' }))).toEqual([]);
  });

  it('내 정복 상태를 붙여 준다', async () => {
    stubKakao();
    const season = await createActiveSeason();
    const me = await memberInGayang();
    const r = await createRestaurant({ name: '국밥집' });
    await createConquest(me.id, r, season.id);
    const res = await search(me.id, { keyword: '국밥' });
    expect(res.body.data.items[0].conquestState).toBe('CONQUERED');
  });

  it.each([
    [{}, 'SEARCH_CONDITION_REQUIRED', '검색어나 카테고리를 골라 주세요.'],
    [{ keyword: '   ' }, 'SEARCH_CONDITION_REQUIRED', undefined],
    [{ keyword: '가'.repeat(31) }, 'KEYWORD_TOO_LONG', '검색어는 30자 이내로 입력해 주세요.'],
    [{ categoryId: 99 }, 'INVALID_CATEGORY', '없는 카테고리예요.'],
    [{ keyword: '국밥', sort: 'RATING' }, 'INVALID_SORT', '정렬·범위 값이 올바르지 않아요.'],
    [{ keyword: '국밥', scope: 'CITY' }, 'INVALID_SCOPE', '정렬·범위 값이 올바르지 않아요.'],
    [{ keyword: '국밥', lat: '37.5' }, 'INVALID_COORDINATE', undefined],
    [{ keyword: '국밥', size: 51 }, 'VALIDATION_ERROR', undefined],
  ])('400 %j → %s', async (query, code, message) => {
    stubKakao();
    const me = await memberInGayang();
    const res = await search(me.id, query);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(code);
    if (message) expect(res.body.message).toBe(message);
  });

  it('30자 검색어는 받는다', async () => {
    stubKakao();
    const me = await memberInGayang();
    const res = await search(me.id, { keyword: '가'.repeat(30) });
    expect(res.status).toBe(200);
  });

  it('기준 동이 구면 400 REGION_NOT_DONG', async () => {
    stubKakao();
    const me = await memberInGayang();
    const res = await search(me.id, { keyword: '국밥', regionId: (await region(GANGSEO)).id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REGION_NOT_DONG');
  });
});

describe('RECO-01 GET /recommendations', () => {
  async function recommend(userId: bigint, query: Record<string, string | number> = {}) {
    return request(app)
      .get('/api/v1/recommendations')
      .query(query)
      .set('Authorization', bearer(userId));
  }

  it('LOCAL_POPULAR(기본): 로컬 방문 1회 이상, 로컬 방문 → 리뷰 수 → id 순', async () => {
    const me = await memberInGayang();
    const a = await createRestaurant({ name: 'A' });
    const b = await createRestaurant({ name: 'B' });
    const c = await createRestaurant({ name: 'C' });
    const zero = await createRestaurant({ name: '로컬없음' });
    const other = await createRestaurant({ name: '등촌', dongCode: DEUNGCHON });
    await stat(a.id, { localVisitCount: 2, reviewCount: 1, visitCount: 4 });
    await stat(b.id, { localVisitCount: 2, reviewCount: 3, visitCount: 2 });
    await stat(c.id, { localVisitCount: 9, visitCount: 9, visitorCount: 7 });
    await stat(zero.id, { localVisitCount: 0, visitCount: 3 });
    await stat(other.id, { localVisitCount: 50 });

    const res = await recommend(me.id);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('추천 맛집을 조회했어요.');
    const gayang = await region(GAYANG);
    expect(res.body.data).toMatchObject({
      type: 'LOCAL_POPULAR',
      region: {
        regionId: gayang.id,
        level: 3,
        dongName: '가양동',
        sigunguId: gayang.parentId,
        sigunguName: '강서구',
      },
      page: 1,
      size: 20,
      totalCount: 3,
      hasNext: false,
    });
    expect(names(res)).toEqual(['C', 'B', 'A']);
    expect(res.body.data.items[0]).toEqual({
      rank: 1,
      restaurantId: Number(c.id),
      name: 'C',
      categoryId: 1,
      categoryName: '한식',
      distanceM: null,
      rating: { score: null, reviewCount: 0 },
      myOverallScore: null,
      hasMapae: false,
      revisitRate: 0,
      localVisitRate: 100,
      visitorCount: 7,
      conquestState: 'NOT_CONQUERED',
    });
  });

  it('REVISIT: 방문자 5명 이상, 재방문 % → 방문자 수 → id 순', async () => {
    const me = await memberInGayang();
    const a = await createRestaurant({ name: 'A' });
    const b = await createRestaurant({ name: 'B' });
    const c = await createRestaurant({ name: 'C' });
    const few = await createRestaurant({ name: '방문자적음' });
    await stat(a.id, { visitorCount: 10, revisitorCount: 5 });
    await stat(b.id, { visitorCount: 20, revisitorCount: 10 });
    await stat(c.id, { visitorCount: 5, revisitorCount: 4 });
    await stat(few.id, { visitorCount: 4, revisitorCount: 4 });
    const res = await recommend(me.id, { type: 'REVISIT' });
    expect(names(res)).toEqual(['C', 'B', 'A']);
  });

  it('RATING: 인증 평가 5개 이상, 신뢰도 가중 별점 R(display_score) → 리뷰 수 → id 순', async () => {
    const me = await memberInGayang();
    const a = await createRestaurant({ name: 'A' });
    const b = await createRestaurant({ name: 'B' });
    const few = await createRestaurant({ name: '리뷰적음' });
    const notYet = await createRestaurant({ name: '계산전' });
    await stat(a.id, { reviewCount: 5, displayScore: 4.5 });
    await stat(b.id, { reviewCount: 8, displayScore: 4.8 });
    await stat(few.id, { reviewCount: 4, displayScore: 5 });
    await stat(notYet.id, { reviewCount: 9, displayScore: null });
    const res = await recommend(me.id, { type: 'RATING' });
    expect(names(res)).toEqual(['B', 'A']);
    expect(res.body.data.items[0].rating).toEqual({ score: 4.8, reviewCount: 8 });
  });

  it('카테고리를 고르지 않으면 좋아하는 음식(S-05-1) 가게를 먼저 보여 준다', async () => {
    const me = await memberInGayang();
    await prisma.memberPreferredCategory.createMany({
      data: [
        { userId: me.id, categoryId: 6 },
        { userId: me.id, categoryId: 2 },
      ],
    });
    const korean = await createRestaurant({ name: '한식집', categoryId: 1 });
    const meat = await createRestaurant({ name: '고깃집', categoryId: 6 });
    const chinese = await createRestaurant({ name: '중식집', categoryId: 2 });
    await stat(korean.id, { localVisitCount: 9 });
    await stat(meat.id, { localVisitCount: 1 });
    await stat(chinese.id, { localVisitCount: 3 });

    const res = await recommend(me.id);
    expect(names(res)).toEqual(['중식집', '고깃집', '한식집']);
    expect(res.body.data.preferredCategories).toEqual([
      { categoryId: 2, categoryName: '중식' },
      { categoryId: 6, categoryName: '고깃집' },
    ]);

    // 카테고리를 고르면 그 카테고리만 보여 주고 좋아하는 음식 안내는 없다
    const picked = await recommend(me.id, { categoryId: 1 });
    expect(names(picked)).toEqual(['한식집']);
    expect(picked.body.data.preferredCategories).toEqual([]);
  });

  it('페이지가 넘어가도 rank가 이어진다', async () => {
    const me = await memberInGayang();
    for (let i = 0; i < 3; i += 1) {
      const r = await createRestaurant({ name: `R${i}` });
      await stat(r.id, { localVisitCount: 10 - i });
    }
    const res = await recommend(me.id, { page: 2, size: 2 });
    expect(res.body.data).toMatchObject({ totalCount: 3, hasNext: false });
    expect(res.body.data.items.map((i: { rank: number }) => i.rank)).toEqual([3]);
  });

  it('구를 고르면 구 전체에서 추천하고 dongName은 null', async () => {
    const me = await memberInGayang();
    const a = await createRestaurant({ name: '가양' });
    const b = await createRestaurant({ name: '등촌', dongCode: DEUNGCHON });
    await stat(a.id, { localVisitCount: 1 });
    await stat(b.id, { localVisitCount: 2 });
    const gangseo = await region(GANGSEO);
    const res = await recommend(me.id, { regionId: gangseo.id });
    expect(res.body.data.region).toEqual({
      regionId: gangseo.id,
      level: 2,
      dongName: null,
      sigunguId: gangseo.id,
      sigunguName: '강서구',
    });
    expect(names(res)).toEqual(['등촌', '가양']);
  });

  it('카테고리로 거르고, 내 위치가 있으면 거리를 준다', async () => {
    const me = await memberInGayang();
    const korean = await createRestaurant({ name: '한식', categoryId: 1 });
    const cafe = await createRestaurant({
      name: '카페',
      categoryId: 11,
      lat: 37.5664,
      lng: 126.8447,
    });
    await stat(korean.id, { localVisitCount: 5 });
    await stat(cafe.id, { localVisitCount: 1 });
    const res = await recommend(me.id, { categoryId: 11, lat: '37.5664', lng: '126.8447' });
    expect(names(res)).toEqual(['카페']);
    expect(res.body.data.items[0].distanceM).toBe(0);
  });

  it('추천할 가게가 없으면 빈 목록', async () => {
    const me = await memberInGayang();
    const res = await recommend(me.id, { type: 'RATING' });
    expect(res.body.data).toMatchObject({ items: [], totalCount: 0, hasNext: false });
  });

  it.each([
    [{ type: 'NEW' }, 400, 'INVALID_RECOMMENDATION_TYPE', '추천 기준이 올바르지 않아요.'],
    [{ categoryId: 0 }, 400, 'INVALID_CATEGORY', undefined],
    [{ regionId: 99999999 }, 404, 'REGION_NOT_FOUND', undefined],
    [{ lng: '126.84' }, 400, 'INVALID_COORDINATE', undefined],
  ])('%j → %i %s', async (query, status, code, message) => {
    const me = await memberInGayang();
    const res = await recommend(me.id, query);
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
    if (message) expect(res.body.message).toBe(message);
  });

  it('시·도(서울특별시)를 고르면 400 REGION_NOT_SUPPORTED', async () => {
    const me = await memberInGayang();
    const seoul = await prisma.region.findFirstOrThrow({ where: { level: 1 } });
    const res = await recommend(me.id, { regionId: seoul.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REGION_NOT_SUPPORTED');
    expect(res.body.message).toBe('지금은 서울만 볼 수 있어요.');
  });
});

describe('myOverallScore — 회원마다 내 취향 비중으로 계산 (SEARCH-02·RECO-01)', () => {
  // 맛 별점 4.4, 세부 평가 10개 (청결 4.3·양 4.4·서비스 4.5·가격 4.2) — 피그마 3-2 계산 보기 예시
  async function tasteFixture() {
    const shop = await createRestaurant({ name: '취향식당' });
    await stat(shop.id, {
      reviewCount: 12,
      displayScore: 4.4,
      detailReviewCount: 10,
      cleanlinessSum: 43,
      portionSum: 44,
      serviceSum: 45,
      priceSum: 42,
      localVisitCount: 1,
    });
    const plain = await memberInGayang(); // 모두 보통 → (4.4 + 4.3 + 4.4 + 4.5 + 4.2) ÷ 5 = 4.36
    const picky = await memberInGayang(); // 맛·청결 아주 중요, 가격 중요 → 4.34
    await prisma.member.update({
      where: { id: picky.id },
      data: { weightTaste: 3, weightCleanliness: 3, weightPrice: 2 },
    });
    return { plain, picky };
  }

  const scoreOf = (res: request.Response) => {
    expect(res.status).toBe(200);
    return res.body.data.items.find((i: { name: string }) => i.name === '취향식당')?.myOverallScore;
  };

  it('검색 결과', async () => {
    stubKakao();
    const { plain, picky } = await tasteFixture();
    const search = (userId: bigint) =>
      request(app)
        .get('/api/v1/restaurants/search')
        .query({ keyword: '취향' })
        .set('Authorization', bearer(userId));
    expect(scoreOf(await search(plain.id))).toBe(4.4);
    expect(scoreOf(await search(picky.id))).toBe(4.3);
  });

  it('추천 맛집', async () => {
    const { plain, picky } = await tasteFixture();
    const recommend = (userId: bigint) =>
      request(app).get('/api/v1/recommendations').set('Authorization', bearer(userId));
    expect(scoreOf(await recommend(plain.id))).toBe(4.4);
    expect(scoreOf(await recommend(picky.id))).toBe(4.3);
  });
});
