import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { env } from '../../src/config/env';
import { runReviewAiJob } from '../../src/jobs/jobs';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from '../helpers/db';
import { bearer, createMember, createRestaurant, createVisit } from '../helpers/fixtures';

const app = createApp();
const noWait = () => Promise.resolve();

/** 글이 있는 공개 리뷰 한 개 */
async function textReview(content: string) {
  const writer = await createMember();
  const shop = await createRestaurant();
  const visit = await createVisit(writer.id, shop.id);
  return prisma.review.create({
    data: {
      visitId: visit.id,
      userId: writer.id,
      restaurantId: shop.id,
      overallScore: 4,
      content,
      contentRegDate: new Date(),
    },
  });
}

/** Gemini generateContent 응답 흉내 */
const answer = (body: object) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );

beforeEach(async () => {
  await resetDb();
  env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
  env.GEMINI_API_KEY = undefined;
  vi.unstubAllGlobals();
});

describe('review-ai 주기 작업 (Gemini 리뷰 분석)', () => {
  it('키가 없으면 부르지 않는다', async () => {
    env.GEMINI_API_KEY = undefined;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await textReview('맛있어요');
    expect(await runReviewAiJob(new Date(), noWait)).toEqual({
      skipped: 'GEMINI_API_KEY가 없어 분석하지 않았어요',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('분석 전 리뷰 글만 보내고, 협찬 문구를 찾으면 ad_suspected → 운영자 마패 확인 목록', async () => {
    const ad = await textReview('사장님께 음료 서비스 받고 작성한 리뷰예요. 맛있어요!');
    const plain = await textReview('국물이 진하고 양이 많아요.');
    const done = await textReview('이미 분석한 글');
    await prisma.review.update({ where: { id: done.id }, data: { aiCheckedAt: new Date() } });
    const fetch = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as {
        contents: { parts: { text: string }[] }[];
      };
      const text = body.contents[0].parts[0].text;
      return Promise.resolve(
        answer(
          text.includes('서비스 받고')
            ? {
                adSuspected: true,
                adEvidence: '음료 서비스 받고 작성한 리뷰예요',
                aiLikeTone: false,
              }
            : { adSuspected: false, adEvidence: null, aiLikeTone: false },
        ),
      );
    });
    vi.stubGlobal('fetch', fetch);
    const now = new Date('2026-11-06T03:00:00Z');

    expect(await runReviewAiJob(now, noWait)).toEqual({
      checked: 2,
      analyzed: 2,
      adSuspected: 1,
      errors: 0,
      unreadable: 0,
      rateLimited: false,
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`,
    );
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('test-key');
    const config = JSON.parse(init.body as string).generationConfig;
    expect(config).toMatchObject({ responseMimeType: 'application/json' });
    // 3.5 Flash-Lite부터 쓰지 않는 샘플링 값은 보내지 않는다
    expect(config).not.toHaveProperty('temperature');

    const saved = await prisma.review.findUniqueOrThrow({ where: { id: ad.id } });
    expect(saved).toMatchObject({ adSuspected: true, aiCheckedAt: now });
    expect(saved.aiResult).toEqual({
      adSuspected: true,
      adEvidence: '음료 서비스 받고 작성한 리뷰예요',
      aiLikeTone: false,
      model: env.GEMINI_MODEL,
      length: ad.content?.length,
      imageCount: 0,
    });
    expect((await prisma.review.findUniqueOrThrow({ where: { id: plain.id } })).adSuspected).toBe(
      false,
    );

    const admin = await createMember({ role: 'A' });
    const list = await request(app)
      .get('/api/v1/admin/reviews')
      .query({ adSuspected: true })
      .set('Authorization', bearer(admin.id));
    expect(list.body.data.items.map((r: { reviewId: number }) => r.reviewId)).toEqual([
      Number(ad.id),
    ]);
  });

  it('호출 한도(429)에 걸리면 멈추고, 실패한 리뷰는 다음에 다시 한다', async () => {
    const first = await textReview('첫 번째 글');
    const second = await textReview('두 번째 글');
    await textReview('세 번째 글');
    const replies = [new Response('oops', { status: 500 }), new Response('{}', { status: 429 })];
    const fetch = vi.fn(() => Promise.resolve(replies.shift()!));
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await runReviewAiJob(new Date(), noWait)).toEqual({
      checked: 3,
      analyzed: 0,
      adSuspected: 0,
      errors: 1,
      unreadable: 0,
      rateLimited: true,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    const rows = await prisma.review.findMany({
      where: { id: { in: [first.id, second.id] } },
      select: { aiCheckedAt: true },
    });
    expect(rows.every((r) => r.aiCheckedAt === null)).toBe(true);
  });

  it('200인데 답을 읽을 수 없으면 대기열에서 빼고(unreadable), 다음 실행에서 다시 부르지 않는다', async () => {
    const review = await textReview('맛있어요');
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '모름' }] } }] })),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const now = new Date('2026-11-06T03:00:00Z');

    expect(await runReviewAiJob(now, noWait)).toMatchObject({
      checked: 1,
      analyzed: 0,
      errors: 0,
      unreadable: 1,
    });
    expect(await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).toMatchObject({
      aiCheckedAt: now,
      adSuspected: false,
      aiResult: { unreadable: true, model: env.GEMINI_MODEL },
    });
    expect(await runReviewAiJob(now, noWait)).toMatchObject({ checked: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('분석하는 사이에 글을 고치면 결과를 저장하지 않고, 고친 글은 다음 실행에서 다시 분석한다', async () => {
    const review = await textReview('사장님께 서비스 받고 작성');
    let edit = true;
    const fetch = vi.fn(async () => {
      if (edit) {
        edit = false;
        await prisma.review.update({
          where: { id: review.id },
          data: { content: '내 돈 내고 먹었어요' },
        });
        return answer({ adSuspected: true, adEvidence: '서비스 받고 작성', aiLikeTone: false });
      }
      return answer({ adSuspected: false, adEvidence: null, aiLikeTone: false });
    });
    vi.stubGlobal('fetch', fetch);

    expect(await runReviewAiJob(new Date(), noWait)).toMatchObject({ checked: 1, analyzed: 0 });
    expect(await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).toMatchObject({
      aiResult: null,
      aiCheckedAt: null,
      adSuspected: false,
    });

    expect(await runReviewAiJob(new Date(), noWait)).toMatchObject({ checked: 1, analyzed: 1 });
    const body = JSON.parse(
      (fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.contents[0].parts[0].text).toContain('내 돈 내고 먹었어요');
  });

  it('리뷰 글을 고치면 분석 결과를 지우고 다시 분석한다', async () => {
    const review = await textReview('서비스 받고 작성');
    await prisma.review.update({
      where: { id: review.id },
      data: { aiCheckedAt: new Date(), adSuspected: true, aiResult: { adSuspected: true } },
    });
    const res = await request(app)
      .patch(`/api/v1/reviews/${review.id}`)
      .set('Authorization', bearer(review.userId))
      .send({ content: '내 돈 내고 먹었어요' });
    expect(res.status).toBe(200);
    const saved = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
    expect(saved).toMatchObject({ aiCheckedAt: null, adSuspected: false, aiResult: null });
  });
});
