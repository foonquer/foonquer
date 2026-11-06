import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { env } from '../../src/config/env';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from '../helpers/db';
import { agreeConsents, bearer, createMember } from '../helpers/fixtures';

const app = createApp();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 카카오 coord2regioncode 응답을 흉내 낸다 */
function stubCoord2Region(documents: { region_type: string; code: string }[], status = 200) {
  const fetchMock = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://dapi.kakao.com/v2/local/geo/coord2regioncode.json')) {
      return Promise.resolve(jsonResponse({ documents }, status));
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** 프로필 설정 전(약관 동의 후) 회원 */
async function pendingMember() {
  const member = await createMember({ status: 'P', nickname: null });
  await agreeConsents(member.id);
  return member;
}

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('region seed', () => {
  it('서울 1개 · 구 25개 · 법정동 467개가 들어 있다', async () => {
    expect(await prisma.region.count({ where: { level: 1 } })).toBe(1);
    expect(await prisma.region.count({ where: { level: 2 } })).toBe(25);
    expect(await prisma.region.count({ where: { level: 3 } })).toBe(467);

    const gayang = await prisma.region.findUniqueOrThrow({
      where: { code: '1150010400' },
      include: { parent: true },
    });
    expect(gayang.name).toBe('가양동');
    expect(gayang.fullName).toBe('서울특별시 강서구 가양동');
    expect(gayang.parent?.code).toBe('1150000000');
    expect(Number(gayang.centerLat)).toBeGreaterThan(37.5);
    expect(Number(gayang.centerLng)).toBeGreaterThan(126.8);
  });
});

describe('REGION-01 GET /regions/search', () => {
  it('동 이름으로 찾고 구 정보와 중심 좌표를 같이 준다', async () => {
    const member = await pendingMember();
    const res = await request(app)
      .get('/api/v1/regions/search')
      .query({ keyword: '가양' })
      .set('Authorization', bearer(member.id));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('동네를 찾았어요.');
    expect(res.body.data.keyword).toBe('가양');
    expect(res.body.data.totalCount).toBe(1);
    const gangseo = await prisma.region.findUniqueOrThrow({ where: { code: '1150000000' } });
    expect(res.body.data.items[0]).toEqual({
      regionId: expect.any(Number),
      dongName: '가양동',
      sigunguId: gangseo.id,
      sigunguName: '강서구',
      fullName: '서울특별시 강서구 가양동',
      centerLat: expect.any(Number),
      centerLng: expect.any(Number),
    });
  });

  it('공백으로 나눈 단어가 모두 전체 이름에 있어야 한다 (구 이름으로 좁히기)', async () => {
    const member = await pendingMember();
    const all = await request(app)
      .get('/api/v1/regions/search')
      .query({ keyword: '신사동' })
      .set('Authorization', bearer(member.id));
    expect(all.body.data.totalCount).toBe(2);

    const res = await request(app)
      .get('/api/v1/regions/search')
      .query({ keyword: '강남 신사' })
      .set('Authorization', bearer(member.id));
    expect(res.body.data.totalCount).toBe(1);
    expect(res.body.data.items[0].fullName).toBe('서울특별시 강남구 신사동');
  });

  it('동 이름이 같은 것 → 검색어로 시작하는 것 → 나머지 순서, 같으면 가나다순', async () => {
    const member = await pendingMember();
    const res = await request(app)
      .get('/api/v1/regions/search')
      .query({ keyword: '종로', limit: 50 })
      .set('Authorization', bearer(member.id));

    const names: string[] = res.body.data.items.map((i: { dongName: string }) => i.dongName);
    // 종로1가~6가가 먼저, 그다음 종로구의 다른 동(전체 이름에 '종로'가 들어감)
    expect(names.slice(0, 6)).toEqual([
      '종로1가',
      '종로2가',
      '종로3가',
      '종로4가',
      '종로5가',
      '종로6가',
    ]);
    const rest = names.slice(6);
    expect(rest.length).toBeGreaterThan(0);
    expect(rest.every((n) => !n.startsWith('종로'))).toBe(true);
    expect([...rest].sort((a, b) => a.localeCompare(b, 'ko'))).toEqual(rest);

    const exact = await request(app)
      .get('/api/v1/regions/search')
      .query({ keyword: '역삼동' })
      .set('Authorization', bearer(member.id));
    expect(exact.body.data.items[0].dongName).toBe('역삼동');
  });

  it('limit만큼 주고 totalCount는 limit 전 개수다 (기본 20)', async () => {
    const member = await pendingMember();
    const res = await request(app)
      .get('/api/v1/regions/search')
      .query({ keyword: '동' })
      .set('Authorization', bearer(member.id));
    expect(res.body.data.items).toHaveLength(20);
    expect(res.body.data.totalCount).toBeGreaterThan(20);

    const limited = await request(app)
      .get('/api/v1/regions/search')
      .query({ keyword: '동', limit: 3 })
      .set('Authorization', bearer(member.id));
    expect(limited.body.data.items).toHaveLength(3);
    expect(limited.body.data.totalCount).toBe(res.body.data.totalCount);
  });

  it('결과가 없으면 빈 목록', async () => {
    const member = await pendingMember();
    const res = await request(app)
      .get('/api/v1/regions/search')
      .query({ keyword: '없는동네' })
      .set('Authorization', bearer(member.id));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ keyword: '없는동네', items: [], totalCount: 0 });
  });

  it.each([
    [{}, 'KEYWORD_REQUIRED', '동 이름을 입력해 주세요.'],
    [{ keyword: '   ' }, 'KEYWORD_REQUIRED', '동 이름을 입력해 주세요.'],
    [{ keyword: '가'.repeat(21) }, 'KEYWORD_TOO_LONG', '20자 이내로 입력해 주세요.'],
    [{ keyword: '가양', limit: 51 }, 'VALIDATION_ERROR', undefined],
    [{ keyword: '가양', limit: 0 }, 'VALIDATION_ERROR', undefined],
  ])('잘못된 검색어 %j → 400 %s', async (query, code, message) => {
    const member = await pendingMember();
    const res = await request(app)
      .get('/api/v1/regions/search')
      .query(query)
      .set('Authorization', bearer(member.id));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(code);
    if (message) expect(res.body.message).toBe(message);
  });

  it('토큰이 없으면 401, 약관 동의 전이면 403 TERMS_REQUIRED', async () => {
    const noToken = await request(app).get('/api/v1/regions/search').query({ keyword: '가양' });
    expect(noToken.status).toBe(401);
    expect(noToken.body.code).toBe('TOKEN_REQUIRED');

    const member = await createMember({ status: 'P', nickname: null });
    const res = await request(app)
      .get('/api/v1/regions/search')
      .query({ keyword: '가양' })
      .set('Authorization', bearer(member.id));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TERMS_REQUIRED');
  });

  it('활성 회원도 부를 수 있다', async () => {
    const member = await createMember();
    const res = await request(app)
      .get('/api/v1/regions/search')
      .query({ keyword: '가양' })
      .set('Authorization', bearer(member.id));
    expect(res.status).toBe(200);
  });
});

describe('REGION-02 GET /regions/current', () => {
  it('카카오 법정동(B) 코드로 동을 찾는다', async () => {
    const fetchMock = stubCoord2Region([
      { region_type: 'H', code: '1150060300' },
      { region_type: 'B', code: '1150010400' },
    ]);
    const member = await pendingMember();

    const res = await request(app)
      .get('/api/v1/regions/current')
      .query({ lat: '37.5618', lng: '126.8545' })
      .set('Authorization', bearer(member.id));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('지금 계신 동네를 찾았어요.');
    expect(res.body.data).toMatchObject({
      dongName: '가양동',
      sigunguName: '강서구',
      fullName: '서울특별시 강서구 가양동',
    });

    const [input, init] = fetchMock.mock.calls[0];
    const called = new URL(input instanceof Request ? input.url : input);
    expect(called.searchParams.get('x')).toBe('126.8545');
    expect(called.searchParams.get('y')).toBe('37.5618');
    expect(new Headers(init?.headers).get('Authorization')).toBe('KakaoAK test-kakao-rest-key');
  });

  it('KAKAO_LOCAL_API_KEY가 있으면 로컬 API는 그 키로 부른다 (카카오맵 쿼터가 다른 앱에 있을 때)', async () => {
    env.KAKAO_LOCAL_API_KEY = 'test-kakao-local-key';
    try {
      const fetchMock = stubCoord2Region([{ region_type: 'B', code: '1150010400' }]);
      const member = await pendingMember();
      const res = await request(app)
        .get('/api/v1/regions/current')
        .query({ lat: '37.5618', lng: '126.8545' })
        .set('Authorization', bearer(member.id));

      expect(res.status).toBe(200);
      const [, init] = fetchMock.mock.calls[0];
      expect(new Headers(init?.headers).get('Authorization')).toBe('KakaoAK test-kakao-local-key');
    } finally {
      env.KAKAO_LOCAL_API_KEY = undefined;
    }
  });

  it('서울이 아니면 400 REGION_NOT_SUPPORTED', async () => {
    stubCoord2Region([{ region_type: 'B', code: '4113510900' }]);
    const member = await pendingMember();
    const res = await request(app)
      .get('/api/v1/regions/current')
      .query({ lat: 37.4, lng: 127.1 })
      .set('Authorization', bearer(member.id));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REGION_NOT_SUPPORTED');
    expect(res.body.message).toBe('지금은 서울에서만 쓸 수 있어요. 동네를 직접 골라 주세요.');
  });

  it('카카오가 행정구역을 못 주면(바다·해외) 400 REGION_NOT_SUPPORTED', async () => {
    stubCoord2Region([]);
    const member = await pendingMember();
    const res = await request(app)
      .get('/api/v1/regions/current')
      .query({ lat: 35, lng: 140 })
      .set('Authorization', bearer(member.id));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REGION_NOT_SUPPORTED');
  });

  it('서울 코드인데 우리 지역 데이터에 없으면 404 REGION_NOT_FOUND', async () => {
    stubCoord2Region([{ region_type: 'B', code: '1150099999' }]);
    const member = await pendingMember();
    const res = await request(app)
      .get('/api/v1/regions/current')
      .query({ lat: 37.56, lng: 126.85 })
      .set('Authorization', bearer(member.id));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('REGION_NOT_FOUND');
    expect(res.body.message).toBe('동네를 찾지 못했어요. 직접 골라 주세요.');
  });

  it('카카오 API가 실패하면 502 KAKAO_API_FAILED', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubCoord2Region([], 500);
    const member = await pendingMember();
    const res = await request(app)
      .get('/api/v1/regions/current')
      .query({ lat: 37.56, lng: 126.85 })
      .set('Authorization', bearer(member.id));
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('KAKAO_API_FAILED');
    expect(res.body.message).toBe('위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  });

  it.each([
    [{ lat: 'abc', lng: '126.85' }],
    [{ lat: '37.56' }],
    [{ lng: '126.85' }],
    [{ lat: '91', lng: '126.85' }],
    [{ lat: '37.56', lng: '181' }],
    [{ lat: '', lng: '' }],
  ])('좌표가 잘못되면 400 INVALID_COORDINATE %j', async (query) => {
    const fetchMock = stubCoord2Region([]);
    const member = await pendingMember();
    const res = await request(app)
      .get('/api/v1/regions/current')
      .query(query)
      .set('Authorization', bearer(member.id));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_COORDINATE');
    expect(res.body.message).toBe('위치 값이 올바르지 않아요.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
