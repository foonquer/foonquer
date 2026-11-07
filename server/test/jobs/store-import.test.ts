import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';
import { runStoreImportJob } from '../../src/modules/restaurant/store-import';
import { prisma } from '../../src/lib/prisma';
import type { PublicStore } from '../../src/lib/store-data';
import { resetDb } from '../helpers/db';
import { createMember, createRestaurant, createVisit } from '../helpers/fixtures';

const GANGSEO = '11500'; // 강서구
const GAYANG = '1150010400'; // 강서구 가양동
/** 따로 정하지 않은 구(강서구 말고 24개)는 그 구의 첫 동에 가게 한 곳씩 준다 */
const OTHER_GUS = 24;
let firstDongOfGu = new Map<string, string>();

/** 상가(상권)정보 상가 한 곳 (기본은 가양동 중심의 칼국숫집) */
function store(overrides: Partial<PublicStore> & { bizesId: string }): PublicStore {
  return {
    bizesNm: `가게${overrides.bizesId}`,
    brchNm: null,
    indsSclsCd: 'I20105',
    indsSclsNm: '국수/칼국수',
    ldongCd: GAYANG,
    lnoAdr: '서울특별시 강서구 가양동 1487',
    rdnmAdr: '서울특별시 강서구 가양로 123',
    lon: '126.8447000',
    lat: '37.5664000',
    ...overrides,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function urlOf(input: string | URL | Request) {
  return new URL(input instanceof Request ? input.url : input);
}

/** fetch mock이 받은 요청 주소들 */
function calledUrls(fetchMock: ReturnType<typeof stubStoreApi>) {
  return fetchMock.mock.calls.map(([input]) => urlOf(input));
}

/** 마지막으로 받은 요청 주소 (페이지마다 다른 응답을 줄 때) */
let lastUrl: URL | null = null;
function urlOfLastCall() {
  if (!lastUrl) throw new Error('요청이 없다');
  return lastUrl;
}

/**
 * 시군구 코드별 상가 목록을 흉내 낸다 (pageSize개씩 나눠 준다).
 * 정하지 않은 구는 그 구 첫 동의 가게 한 곳, 빈 배열이면 결과 없음(03)
 */
function stubStoreApi(byGu: Record<string, PublicStore[] | (() => Response)>, pageSize = 1000) {
  const fetchMock = vi.fn((input: string | URL | Request) => {
    lastUrl = urlOf(input);
    const params = lastUrl.searchParams;
    const gu = params.get('key') ?? '';
    const found = byGu[gu] ?? [
      store({ bizesId: `G${gu}`, bizesNm: `기본${gu}`, ldongCd: firstDongOfGu.get(gu) }),
    ];
    if (typeof found === 'function') return Promise.resolve(found());
    if (found.length === 0) {
      return Promise.resolve(json({ header: { resultCode: '03', resultMsg: 'NODATA_ERROR' } }));
    }
    const pageNo = Number(params.get('pageNo'));
    const items = found.slice((pageNo - 1) * pageSize, pageNo * pageSize);
    return Promise.resolve(
      json({
        header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' },
        body: { items, numOfRows: pageSize, pageNo, totalCount: found.length },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** 강서구 가게 (이름 → 행) */
async function gangseoByName() {
  const rows = await prisma.restaurant.findMany({
    where: { sigungu: { code: `${GANGSEO}00000` } },
    include: { region: true, sigungu: true },
    orderBy: { id: 'asc' },
  });
  return new Map(rows.map((r) => [r.name, r]));
}

beforeEach(async () => {
  await resetDb();
  env.DATA_GO_KR_SERVICE_KEY = 'test-data-go-kr-key';
  const dongs = await prisma.region.findMany({
    where: { level: 3, code: { startsWith: '11' } },
    orderBy: { code: 'asc' },
  });
  firstDongOfGu = new Map();
  for (const d of dongs) {
    if (!firstDongOfGu.has(d.code.slice(0, 5))) firstDongOfGu.set(d.code.slice(0, 5), d.code);
  }
});

afterEach(() => {
  env.DATA_GO_KR_SERVICE_KEY = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('store-import — 공공데이터 상가(상권)정보로 가게 가져오기', () => {
  it('서울 25개 구의 음식 업종 상가를 가져와 카테고리·동을 붙여 저장한다', async () => {
    const fetchMock = stubStoreApi({
      [GANGSEO]: [
        store({ bizesId: 'S1', bizesNm: '명동교자', brchNm: '가양점' }),
        store({
          bizesId: 'S2',
          bizesNm: '가양돼지',
          indsSclsCd: 'I20107',
          indsSclsNm: '돼지고기 구이/찜',
        }),
        store({ bizesId: 'S3', bizesNm: '가양커피', indsSclsCd: 'I21201', indsSclsNm: '카페' }),
        store({ bizesId: 'S4', bizesNm: '회사식당', indsSclsCd: 'I20701', indsSclsNm: '구내식당' }),
        store({ bizesId: 'S5', bizesNm: '경기가게', ldongCd: '4113510300' }),
        store({ bizesId: 'S6', bizesNm: '좌표없음', lat: '', lon: '' }),
      ],
    });

    const result = await runStoreImportJob();

    expect(result).toMatchObject({
      sigungu: 25,
      fetched: 6 + OTHER_GUS,
      skipped: 3,
      created: 3 + OTHER_GUS,
      failed: 0,
    });
    const rows = await gangseoByName();
    expect([...rows.keys()].sort()).toEqual(['가양돼지', '가양커피', '명동교자 가양점']);
    expect(rows.get('명동교자 가양점')).toMatchObject({
      bizesId: 'S1',
      kakaoPlaceId: null,
      categoryId: 1,
      categoryDetail: '국수/칼국수',
      roadAddress: '서울특별시 강서구 가양로 123',
      jibunAddress: '서울특별시 강서구 가양동 1487',
      status: 'A',
      region: expect.objectContaining({ code: GAYANG }),
      sigungu: expect.objectContaining({ code: '1150000000' }),
    });
    expect(rows.get('가양돼지')?.categoryId).toBe(6);
    expect(rows.get('가양커피')?.categoryId).toBe(11);
    expect(rows.get('명동교자 가양점')?.lat.toNumber()).toBe(37.5664);

    // 구마다 한 번, 대분류 음식(I2)만
    expect(fetchMock).toHaveBeenCalledTimes(25);
    const url = calledUrls(fetchMock).find((u) => u.searchParams.get('key') === GANGSEO);
    if (!url) throw new Error('강서구 요청이 없다');
    expect(url.origin + url.pathname).toBe(
      'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      serviceKey: 'test-data-go-kr-key',
      divId: 'signguCd',
      key: GANGSEO,
      indsLclsCd: 'I2',
      numOfRows: '1000',
      pageNo: '1',
      type: 'json',
    });
  });

  it('다시 돌리면 바뀐 것만 갱신하고, 목록에서 빠진 가게는 폐업(C), 다시 나오면 영업(A). 숨긴 가게(H)는 그대로', async () => {
    const first = [
      store({ bizesId: 'S1', bizesNm: '옛이름' }),
      store({ bizesId: 'S2', bizesNm: '없어질가게' }),
      store({ bizesId: 'S3', bizesNm: '숨긴가게' }),
      store({ bizesId: 'S5', bizesNm: '좌표빠짐' }),
    ];
    stubStoreApi({ [GANGSEO]: first });
    await runStoreImportJob();
    await prisma.restaurant.update({ where: { bizesId: 'S3' }, data: { status: 'H' } });
    const closedBefore = await createRestaurant({ bizesId: 'S4', name: '돌아온가게', status: 'C' });

    stubStoreApi({
      [GANGSEO]: [
        store({ bizesId: 'S1', bizesNm: '새이름' }),
        store({ bizesId: 'S4', bizesNm: '돌아온가게' }),
        // 목록에는 있지만 이번엔 좌표가 비어 행으로 바꾸지 못함 → 폐업으로 보지 않는다
        store({ bizesId: 'S5', bizesNm: '좌표빠짐', lat: '', lon: '' }),
      ],
    });
    const result = await runStoreImportJob();

    expect(result).toMatchObject({ created: 0, updated: 2, closed: 1, failed: 0 });
    const rows = await gangseoByName();
    expect(rows.get('새이름')).toMatchObject({ bizesId: 'S1', status: 'A' });
    expect(rows.get('없어질가게')?.status).toBe('C');
    expect(rows.get('숨긴가게')?.status).toBe('H');
    expect(rows.get('좌표빠짐')?.status).toBe('A');
    expect(rows.get('돌아온가게')).toMatchObject({ id: closedBefore.id, status: 'A' });
  });

  it('카카오에서 저장했던 옛 가게는 이름이 맞고 100m 안이면 이어 쓰고, 이어지지 않은 것은 기록이 없으면 지운다', async () => {
    const me = await createMember();
    // 가양동 중심에서 약 30m
    const linked = await createRestaurant({
      bizesId: null,
      kakaoPlaceId: '777',
      name: '명동교자 가양점',
      lat: 37.5666,
      lng: 126.8449,
    });
    await createVisit(me.id, linked.id);
    const farAway = await createRestaurant({
      bizesId: null,
      name: '명동교자',
      lat: 37.58,
      lng: 126.86,
    });
    await createVisit(me.id, farAway.id);
    await createRestaurant({ bizesId: null, name: '아무기록없음' });

    stubStoreApi({ [GANGSEO]: [store({ bizesId: 'S1', bizesNm: '명동교자', brchNm: '가양점' })] });
    const result = await runStoreImportJob();

    expect(result).toMatchObject({
      created: OTHER_GUS,
      linked: 1,
      legacyDeleted: 1,
      legacyKept: 1,
    });
    const rows = [...(await gangseoByName()).values()];
    expect(rows.map((r) => [r.id, r.bizesId, r.kakaoPlaceId, r.name])).toEqual([
      [linked.id, 'S1', '777', '명동교자 가양점'],
      [farAway.id, null, null, '명동교자'],
    ]);
    expect(rows[0].lat.toNumber()).toBe(37.5664);
  });

  it('1000곳이 넘으면 페이지를 이어 받는다', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => store({ bizesId: `S${i}` }));
    const fetchMock = stubStoreApi({ [GANGSEO]: many });
    const result = await runStoreImportJob();
    expect(result).toMatchObject({ created: 1001 + OTHER_GUS, failed: 0 });
    const pages = calledUrls(fetchMock)
      .filter((u) => u.searchParams.get('key') === GANGSEO)
      .map((u) => u.searchParams.get('pageNo'));
    expect(pages).toEqual(['1', '2']);
  });

  it('뒤 페이지가 결과 없음(03)으로 와서 앞에서 본 전체 수보다 적으면 실패로 보고 폐업 처리하지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await createRestaurant({ bizesId: 'OLD', name: '그대로' });
    const firstPage = Array.from({ length: 1000 }, (_, i) => store({ bizesId: `S${i}` }));
    stubStoreApi({
      [GANGSEO]: () =>
        json(
          urlOfLastCall().searchParams.get('pageNo') === '1'
            ? {
                header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' },
                body: { items: firstPage, totalCount: 1500 },
              }
            : { header: { resultCode: '03', resultMsg: 'NODATA_ERROR' } },
        ),
    });

    const result = await runStoreImportJob();

    expect(result).toMatchObject({ failed: 1, closed: 0 });
    expect((await gangseoByName()).get('그대로')?.status).toBe('A');
  });

  it('구 하나가 실패해도(인증키 오류는 XML로 온다) 나머지는 가져오고, 실패한 구의 가게는 폐업 처리하지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await createRestaurant({ bizesId: 'OLD', name: '그대로' });
    stubStoreApi({
      [GANGSEO]: () =>
        new Response(
          '<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>',
          { status: 200 },
        ),
      '11590': [store({ bizesId: 'D1', bizesNm: '흑석동가게', ldongCd: '1159010500' })],
    });

    const result = await runStoreImportJob();

    expect(result).toMatchObject({ sigungu: 24, created: 1 + 23, closed: 0, failed: 1 });
    expect((await gangseoByName()).get('그대로')?.status).toBe('A');
    const heukseok = await prisma.restaurant.findUniqueOrThrow({
      where: { bizesId: 'D1' },
      include: { sigungu: true },
    });
    expect(heukseok.sigungu.code).toBe('1159000000');
  });

  it('빈 목록이거나 전체 수(totalCount)가 없으면 그 구는 실패로 세고 폐업 처리하지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await createRestaurant({ bizesId: 'OLD', name: '그대로' });
    const jongno = await createRestaurant({ bizesId: 'JOLD', dongCode: '1111010100' });
    stubStoreApi({
      [GANGSEO]: [],
      '11590': () =>
        json({
          header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' },
          body: { items: [store({ bizesId: 'D1', ldongCd: '1159010500' })] },
        }),
      '11110': () =>
        json({
          header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' },
          body: { items: [store({ bizesId: 'J1', ldongCd: '1111010100' })], totalCount: null },
        }),
    });

    const result = await runStoreImportJob();

    expect(result).toMatchObject({ sigungu: 22, closed: 0, failed: 3 });
    expect((await gangseoByName()).get('그대로')?.status).toBe('A');
    expect(await prisma.restaurant.count({ where: { bizesId: { in: ['D1', 'J1'] } } })).toBe(0);
    expect((await prisma.restaurant.findUniqueOrThrow({ where: { id: jongno.id } })).status).toBe(
      'A',
    );
  });

  it('포털의 Encoding 키를 넣어도 한 번 풀어서 보낸다', async () => {
    env.DATA_GO_KR_SERVICE_KEY = 'abc%2Bdef%3D%3D';
    const fetchMock = stubStoreApi({});
    await runStoreImportJob();
    expect(calledUrls(fetchMock)[0].searchParams.get('serviceKey')).toBe('abc+def==');
  });

  it('DATA_GO_KR_SERVICE_KEY가 없으면 건너뛴다', async () => {
    env.DATA_GO_KR_SERVICE_KEY = undefined;
    const fetchMock = stubStoreApi({});
    expect(await runStoreImportJob()).toEqual({
      skipped: 'DATA_GO_KR_SERVICE_KEY가 없어 가게를 가져오지 않았어요',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
