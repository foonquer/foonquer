import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { env } from '../../src/config/env';
import { prisma } from '../../src/lib/prisma';
import { sanitizeSituation } from '../../src/modules/situation/situation-parse';
import { resetDb } from '../helpers/db';
import { bearer, createMember, createRestaurant, createVisit } from '../helpers/fixtures';

const app = createApp();

const GAYANG = '1150010400'; // 강서구 가양동
const DEUNGCHON = '1150010200'; // 강서구 등촌동

/** 활성 회원 + 내 동네(0번 = 가양동) */
async function memberInGayang() {
  const me = await createMember();
  const gayang = await prisma.region.findUniqueOrThrow({ where: { code: GAYANG } });
  await prisma.memberLocalRegion.create({
    data: { userId: me.id, regionId: gayang.id, sigunguId: gayang.parentId ?? 0, sortOrder: 0 },
  });
  return me;
}

/** 공개 리뷰가 texts만큼 있는 가게 (리뷰 수·대표 별점·세부 별점은 stat에 직접 넣는다) */
async function shop(
  texts: (string | null)[],
  opts: {
    name?: string;
    dongCode?: string;
    score?: number;
    service?: { sum: number; count: number };
    businessHours?: object;
  } = {},
) {
  const r = await createRestaurant({
    ...(opts.name && { name: opts.name }),
    ...(opts.dongCode && { dongCode: opts.dongCode }),
    ...(opts.businessHours && { businessHours: opts.businessHours }),
  });
  for (const content of texts) {
    const writer = await createMember();
    const visit = await createVisit(writer.id, r.id);
    await prisma.review.create({
      data: {
        visitId: visit.id,
        userId: writer.id,
        restaurantId: r.id,
        overallScore: 4,
        content,
        contentRegDate: content ? new Date() : null,
      },
    });
  }
  await prisma.restaurantStat.create({
    data: {
      restaurantId: r.id,
      reviewCount: texts.length,
      displayScore: opts.score ?? 4,
      serviceSum: opts.service?.sum ?? 0,
      detailReviewCount: opts.service?.count ?? 0,
    },
  });
  return r;
}

const PARENTS = {
  who: 'FAMILY',
  when: 'WEEKEND_LUNCH',
  exclude: ['SPICY'],
  important: ['SPACIOUS', 'PARKING', 'QUIET', 'KIND'],
};

const weekend = {
  sat: [{ open: '11:00', close: '21:00' }],
  sun: [{ open: '11:00', close: '21:00' }],
};
const weekdays = Object.fromEntries(
  ['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => [d, [{ open: '11:00', close: '21:00' }]]),
);

/** Gemini generateContent 응답 흉내 */
const answer = (body: object) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  env.GEMINI_API_KEY = undefined;
  vi.unstubAllGlobals();
});

describe('POST /recommendations/situation/parse', () => {
  it('키가 없으면 키워드 규칙으로 읽고, 중요해요가 없으면 누구랑에 맞춰 미리 골라 둔다', async () => {
    const me = await createMember();
    const res = await request(app)
      .post('/api/v1/recommendations/situation/parse')
      .set('Authorization', bearer(me.id))
      .send({ text: '부모님이랑 주말 점심, 아빠가 매운 거 못 드셔' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      found: true,
      conditions: {
        who: 'FAMILY',
        when: 'WEEKEND_LUNCH',
        exclude: ['SPICY'],
        important: ['SPACIOUS', 'PARKING', 'QUIET', 'KIND'],
      },
      title: '가족과 주말 점심',
      source: 'RULE',
    });
  });

  it('조건을 하나도 못 찾으면 found = false (화면 ⑤)', async () => {
    const me = await createMember();
    const res = await request(app)
      .post('/api/v1/recommendations/situation/parse')
      .set('Authorization', bearer(me.id))
      .send({ text: '아무거나 맛있는 거' });

    expect(res.body.data).toEqual({
      found: false,
      conditions: { who: null, when: null, exclude: [], important: [] },
      title: null,
      source: 'RULE',
    });
  });

  it('Gemini에는 전화번호·이메일을 지우고 보내고, 목록 밖 값은 버린다', async () => {
    env.GEMINI_API_KEY = 'test-key';
    const fetch = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(
        answer({
          who: 'COUPLE',
          when: 'DINNER',
          exclude: ['BAR', 'NOISE'],
          important: ['QUIET', 'VIEW'],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const me = await createMember();

    const res = await request(app)
      .post('/api/v1/recommendations/situation/parse')
      .set('Authorization', bearer(me.id))
      .send({ text: '여친이랑 저녁 010-1234-5678 a@b.com 술집 말고' });

    expect(res.body.data).toEqual({
      found: true,
      conditions: { who: 'COUPLE', when: 'DINNER', exclude: ['BAR'], important: ['QUIET'] },
      title: '연인과 저녁',
      source: 'AI',
    });
    const sent = JSON.parse(fetch.mock.calls[0][1].body as string) as {
      contents: { parts: { text: string }[] }[];
    };
    expect(sent.contents[0].parts[0].text).toBe('여친이랑 저녁 술집 말고');
  });

  it('Gemini가 실패하면 규칙으로 읽는다', async () => {
    env.GEMINI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 500 }))),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const me = await createMember();

    const res = await request(app)
      .post('/api/v1/recommendations/situation/parse')
      .set('Authorization', bearer(me.id))
      .send({ text: '혼밥 빠르게' });

    expect(res.body.data).toMatchObject({
      found: true,
      conditions: { who: 'SOLO', when: null, exclude: [], important: ['SOLO_FRIENDLY', 'FAST'] },
      title: '혼밥할 곳',
      source: 'RULE',
    });
  });

  it('2자 미만·60자 초과는 400', async () => {
    const me = await createMember();
    for (const text of ['아', '가'.repeat(61)]) {
      const res = await request(app)
        .post('/api/v1/recommendations/situation/parse')
        .set('Authorization', bearer(me.id))
        .send({ text });
      expect(res.status).toBe(400);
    }
  });

  it('sanitizeSituation: 전화번호·이메일을 지우고 60자로 자른다', () => {
    expect(sanitizeSituation(' 연락처 01012345678  주말   점심 ')).toBe('연락처 주말 점심');
    expect([...sanitizeSituation('가'.repeat(80))]).toHaveLength(60);
  });
});

describe('POST /recommendations/situation', () => {
  it('조건마다 맞음/부분/안 맞음 → 상황 적합도 순, 신뢰 별점 숫자는 그대로', async () => {
    const me = await memberInGayang();
    const best = await shop(
      [
        '부모님 모시고 갔는데 자리가 넓고 조용해서 좋았어요.',
        '주차 가능해서 편했어요. 부모님도 만족하셨어요.',
        '가족 외식으로 왔어요. 매장이 넓어요.',
        '조용하고 직원분들이 친절해요.',
        '맛있어요',
      ],
      { name: '가양 한상', score: 4.6, service: { sum: 23, count: 5 }, businessHours: weekend },
    );
    const plain = await shop(['맛있어요', '맛있어요', null, null, '또 올게요'], {
      name: '보통 식당',
      score: 4.8,
    });
    // 시끄럽고 좁다는 리뷰뿐 → 적합도 50% 미만
    await shop(Array(5).fill('시끄럽고 자리가 좁아요'), {
      name: '소란 식당',
      service: { sum: 15, count: 5 },
    });
    // 매운 음식 빼기 → 가게 이름에 걸려서 제외
    await shop(Array(5).fill('맛있어요'), { name: '마라 천국' });
    // 주말에 문을 닫음 → 제외
    await shop(Array(5).fill('부모님이랑 왔어요'), { name: '평일 식당', businessHours: weekdays });
    // 인증 리뷰 4개 → 후보 아님
    await shop(Array(4).fill('부모님과 조용히'), { name: '리뷰 적은 집' });

    const res = await request(app)
      .post('/api/v1/recommendations/situation')
      .set('Authorization', bearer(me.id))
      .send({ conditions: PARENTS });

    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.title).toBe('가족과 주말 점심');
    expect(data.region).toMatchObject({ level: 3, dongName: '가양동', sigunguName: '강서구' });
    expect(data.items.map((i: { name: string }) => i.name)).toEqual(['가양 한상', '보통 식당']);
    expect(data.suggestions).toEqual([]);

    const [first, second] = data.items;
    expect(first).toMatchObject({
      restaurantId: Number(best.id),
      fitScore: 92,
      rating: { score: 4.6, reviewCount: 5 },
      why: '넓다는 리뷰 2건 · 조용하다는 리뷰 2건',
      tags: ['좌석 넉넉', '조용함', '친절'],
    });
    expect(first.reasons).toEqual([
      {
        kind: 'WHO',
        condition: 'FAMILY',
        label: '가족 · 부모님',
        status: 'MATCH',
        evidence: '가족 동행 리뷰 3건',
      },
      {
        kind: 'WHEN',
        condition: 'WEEKEND_LUNCH',
        label: '주말 점심',
        status: 'MATCH',
        evidence: '토·일 12시 영업',
      },
      {
        kind: 'EXCLUDE',
        condition: 'SPICY',
        label: '매운 음식 빼기',
        status: 'MATCH',
        evidence: '맵다는 리뷰 없음',
      },
      {
        kind: 'IMPORTANT',
        condition: 'SPACIOUS',
        label: '좌석 넓음',
        status: 'MATCH',
        evidence: '넓다는 리뷰 2건',
      },
      {
        kind: 'IMPORTANT',
        condition: 'PARKING',
        label: '주차',
        status: 'PARTIAL',
        evidence: '주차 편하다는 리뷰 1건',
      },
      {
        kind: 'IMPORTANT',
        condition: 'QUIET',
        label: '조용함',
        status: 'MATCH',
        evidence: '조용하다는 리뷰 2건',
      },
      {
        kind: 'IMPORTANT',
        condition: 'KIND',
        label: '친절',
        status: 'MATCH',
        evidence: '서비스 4.6 (동네 평균 +0.8)',
      },
    ]);
    // 근거가 없으면 안 맞음이 아니라 "정보 부족"(부분)
    expect(second).toMatchObject({
      restaurantId: Number(plain.id),
      fitScore: 56,
      rating: { score: 4.8, reviewCount: 5 },
      why: '맵다는 리뷰 없음',
      tags: [],
    });
    expect(second.reasons[1]).toMatchObject({ status: 'PARTIAL', evidence: '영업시간 정보 없음' });
    expect(second.reasons[3]).toMatchObject({ status: 'PARTIAL', evidence: '관련 리뷰 아직 없음' });
  });

  it('딱 맞는 곳이 없으면 하나만 뺐을 때 가게 수와 동네 넓히기를 제안한다 (⑥)', async () => {
    const me = await memberInGayang();
    await shop(
      [
        '친구랑 왔는데 웨이팅이 길어요',
        '친구랑 웨이팅 30분',
        '친구랑 줄 서서 먹었어요',
        '맛있어요',
        '맛있어요',
      ],
      { name: '줄 서는 집' },
    );
    await shop(Array(5).fill('맛있어요'), { name: '옆 동네 집', dongCode: DEUNGCHON });

    const res = await request(app)
      .post('/api/v1/recommendations/situation')
      .set('Authorization', bearer(me.id))
      .send({ conditions: { who: 'FRIEND', exclude: ['LONG_WAIT'] } });

    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.suggestions).toEqual([
      {
        type: 'REMOVE',
        kind: 'EXCLUDE',
        condition: 'LONG_WAIT',
        regionId: null,
        label: '웨이팅 긴 곳도 보기',
        count: 1,
      },
      {
        type: 'WIDEN',
        kind: null,
        condition: null,
        regionId: res.body.data.region.sigunguId,
        label: '동네 넓히기 · 강서구 전체',
        count: 1,
      },
    ]);

    // 넓힌 동네(구)로 다시 부르면 옆 동네 가게가 나온다
    const wide = await request(app)
      .post('/api/v1/recommendations/situation')
      .set('Authorization', bearer(me.id))
      .send({
        regionId: res.body.data.region.sigunguId,
        conditions: { who: 'FRIEND', exclude: ['LONG_WAIT'] },
      });
    expect(wide.body.data.items.map((i: { name: string }) => i.name)).toEqual(['옆 동네 집']);
    expect(wide.body.data.region).toMatchObject({ level: 2, dongName: null });
  });

  it('조건이 없거나 중요해요가 5개를 넘으면 400', async () => {
    const me = await memberInGayang();
    for (const conditions of [
      {},
      { important: ['SPACIOUS', 'ROOM', 'PARKING', 'QUIET', 'KIND', 'FAST'] },
      { who: 'ALIEN' },
    ]) {
      const res = await request(app)
        .post('/api/v1/recommendations/situation')
        .set('Authorization', bearer(me.id))
        .send({ conditions });
      expect(res.status).toBe(400);
    }
  });
});
