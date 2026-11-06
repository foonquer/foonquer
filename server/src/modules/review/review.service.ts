import type { Tx } from '../../common/db';
import { AppError } from '../../common/errors/app-error';
import { toPageResult } from '../../common/pagination';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { deleteObjectQuietly } from '../../lib/storage';
import {
  checkAchievements,
  nextConquestReward,
  type UnlockedAchievement,
} from '../achievement/achievement.service';
import { applyConquest } from '../conquest/conquest.service';
import {
  refreshReviewWeight,
  refreshRestaurantStat,
  REVISIT_INTENT_MIN_SCORE,
} from '../restaurant/restaurant-stat-calc';
import { RestaurantError } from '../restaurant/restaurant.errors';
import { grantReward, type RewardResult, sumRewards } from '../reward/reward.service';
import { assertUploadedImages } from '../upload/uploaded-image';
import { UserError } from '../user/user.errors';
import { VisitError } from '../visit/visit.errors';
import { reviewCardInclude, toReviewCards } from './review-card';
import type {
  RatingBody,
  RestaurantReviewQuery,
  ReviewDetailBody,
  ReviewUpdateBody,
  UserReviewQuery,
} from './review.schema';
import { ReviewError } from './review.errors';
import { changeTrustTemp } from './trust-temp';

/** 내가 차단한 회원 id (리뷰 목록에서 뺀다) */
async function blockedIdsOf(viewerId: bigint) {
  const rows = await prisma.memberBlock.findMany({
    where: { blockerId: viewerId },
    select: { blockedId: true },
  });
  return rows.map((r) => r.blockedId);
}

/** REVIEW-01 종합 별점 등록 및 정복 완료 */
export async function rateVisit(
  userId: bigint,
  visitId: number,
  body: RatingBody,
  now = new Date(),
) {
  const result = await prisma.$transaction(
    async (tx) => {
      const [locked] = await tx.$queryRaw<{ user_id: bigint; status: string }[]>`
        SELECT user_id, status FROM visit WHERE id = ${BigInt(visitId)} FOR UPDATE`;
      if (!locked || locked.user_id !== userId) throw new AppError(VisitError.VISIT_NOT_FOUND);
      if (locked.status === 'C') throw new AppError(ReviewError.ALREADY_RATED);
      if (locked.status !== 'V') throw new AppError(ReviewError.VISIT_NOT_VERIFIED);

      const visit = await tx.visit.findUniqueOrThrow({
        where: { id: BigInt(visitId) },
        include: { restaurant: { select: { id: true, name: true, sigunguId: true } } },
      });
      if (!visit.restaurant) throw new AppError(ReviewError.VISIT_NOT_VERIFIED);
      const restaurant = visit.restaurant;

      // 같은 가게를 전에 인증한 적이 있으면 재방문 리뷰 (가중치 v = 1.1)
      const earlier = await tx.visit.count({
        where: { userId, restaurantId: restaurant.id, status: 'C', id: { not: visit.id } },
      });
      const review = await tx.review.create({
        data: {
          visitId: visit.id,
          userId,
          restaurantId: restaurant.id,
          overallScore: body.overallScore,
          isRevisit: earlier > 0,
          regDate: now,
        },
      });
      await tx.visit.update({ where: { id: visit.id }, data: { status: 'C' } });

      const conquest = await applyConquest(tx, {
        userId,
        visitId: visit.id,
        restaurant,
        seasonId: visit.seasonId,
        now,
      });
      await changeTrustTemp(
        tx,
        userId,
        'REVIEW_WRITTEN',
        { type: 'REVIEW', id: review.id },
        null,
        now,
      );
      await refreshReviewWeight(tx, review.id);
      await refreshRestaurantStat(tx, restaurant.id, now);
      return { review, restaurant, conquest };
    },
    { timeout: 15_000 },
  );

  const { review, restaurant, conquest } = result;
  // 정복·보상은 이미 커밋됐다. 보조 정보라 실패해도 null로 응답한다 (다시 보내면 ALREADY_RATED가 되므로)
  const nextReward = await nextConquestReward(prisma, userId, now).catch((err: unknown) => {
    console.error('다음 정복 보상 조회 실패', err);
    return null;
  });
  return {
    reviewId: review.id,
    visitId: review.visitId,
    overallScore: review.overallScore.toNumber(),
    restaurant: { restaurantId: restaurant.id, name: restaurant.name },
    conquest: {
      isNewConquest: conquest.isNewConquest,
      isFirstEver: conquest.isFirstEver,
      sigunguId: conquest.sigungu.sigunguId,
      sigunguName: conquest.sigungu.sigunguName,
      ...(conquest.stat ?? {
        conquestCount: null,
        rank: null,
        previousRank: null,
        topPercent: null,
        tier: null,
        tierTitle: null,
        nextTier: null,
      }),
    },
    rewards: { point: conquest.rewards.point, levelUp: conquest.rewards.levelUp },
    celebrations: {
      tierUp: conquest.tierUp,
      backgroundUnlocked: conquest.backgroundUnlocked,
      achievements: conquest.achievements,
    },
    nextReward,
  };
}

/** 세부 리뷰가 있는 칸만 쓴다 (REVIEW-02·06 공통). 사진은 순서대로 새로 넣는다 */
async function writeDetail(
  tx: Tx,
  reviewId: bigint,
  input: {
    detailScores?: ReviewDetailBody['detailScores'] | null;
    aspects?: ReviewDetailBody['aspects'];
    content?: string | null;
    imageKeys?: string[];
  },
  now: Date,
) {
  const data: Prisma.ReviewUpdateInput = {};
  if (input.detailScores !== undefined) {
    const d = input.detailScores;
    Object.assign(data, {
      cleanliness: d?.cleanliness ?? null,
      portion: d?.portion ?? null,
      service: d?.service ?? null,
      price: d?.price ?? null,
    });
  }
  if (input.content !== undefined) {
    const content = input.content?.trim() || null;
    data.content = content;
    data.contentRegDate = content ? now : null;
    // 글이 바뀌면 AI 분석(review-ai)을 처음부터 다시 한다
    Object.assign(data, { aiResult: Prisma.DbNull, aiCheckedAt: null, adSuspected: false });
  }
  if (input.aspects !== undefined) {
    await tx.reviewAspectMark.deleteMany({ where: { reviewId } });
    if (input.aspects.length > 0) {
      await tx.reviewAspectMark.createMany({
        data: input.aspects.map((a) => ({
          reviewId,
          aspectId: a.aspectId,
          polarity: a.polarity,
          regDate: now,
        })),
      });
    }
  }
  if (input.imageKeys !== undefined) {
    await tx.reviewImage.deleteMany({ where: { reviewId } });
    if (input.imageKeys.length > 0) {
      await tx.reviewImage.createMany({
        data: input.imageKeys.map((imageKey, sortOrder) => ({
          reviewId,
          imageKey,
          sortOrder,
          regDate: now,
        })),
      });
    }
    data.imageCount = input.imageKeys.length;
  }
  data.detailRegDate = now;
  return tx.review.update({ where: { id: reviewId }, data });
}

/** 세부평가 보상: 세부 별점 +20, 글 +30, 사진 +20 (한 리뷰에 한 번씩) */
async function grantDetailRewards(
  tx: Tx,
  review: {
    id: bigint;
    userId: bigint;
    cleanliness: number | null;
    content: string | null;
    imageCount: number;
  },
  restaurantName: string,
  seasonId: number | null,
  now: Date,
): Promise<{ rewards: RewardResult; achievements: UnlockedAchievement[] }> {
  const ref = { type: 'REVIEW', id: review.id };
  const results: RewardResult[] = [];
  if (review.cleanliness !== null) {
    results.push(
      await grantReward(tx, review.userId, 'REVIEW_DETAIL', `${restaurantName} 세부평가`, ref, now),
    );
  }
  if (review.content) {
    results.push(
      await grantReward(tx, review.userId, 'REVIEW_TEXT', `${restaurantName} 글 리뷰`, ref, now),
    );
  }
  if (review.imageCount > 0) {
    results.push(
      await grantReward(tx, review.userId, 'REVIEW_PHOTO', `${restaurantName} 사진 리뷰`, ref, now),
    );
  }
  const achievements = await checkAchievements(
    tx,
    review.userId,
    ['REVIEW_TEXT_COUNT', 'REVIEW_PHOTO_COUNT'],
    seasonId,
    now,
  );
  return { rewards: sumRewards(results), achievements };
}

async function assertAspects(aspects: { aspectId: number }[] | undefined) {
  if (!aspects || aspects.length === 0) return;
  const found = await prisma.reviewAspect.count({
    where: { id: { in: aspects.map((a) => a.aspectId) }, status: 'A' },
  });
  if (found !== aspects.length) throw new AppError(ReviewError.INVALID_ASPECT);
}

/** REVIEW-02 세부평가 남기기 (종합 별점 다음, 한 번만) */
export async function addReviewDetail(
  userId: bigint,
  visitId: number,
  body: ReviewDetailBody,
  now = new Date(),
) {
  const hasContent = Boolean(body.content?.trim());
  if (!body.detailScores && !body.aspects?.length && !hasContent && !body.imageKeys?.length) {
    throw new AppError(ReviewError.REVIEW_DETAIL_EMPTY);
  }
  const visit = await prisma.visit.findUnique({
    where: { id: BigInt(visitId) },
    include: {
      review: true,
      restaurant: { select: { name: true } },
      season: { select: { id: true } },
    },
  });
  if (!visit || visit.userId !== userId) throw new AppError(VisitError.VISIT_NOT_FOUND);
  if (!visit.review) throw new AppError(ReviewError.RATING_REQUIRED);
  const review = visit.review;
  if (review.detailRegDate || review.content || review.imageCount > 0) {
    throw new AppError(ReviewError.REVIEW_DETAIL_EXISTS);
  }
  await assertAspects(body.aspects);
  if (body.imageKeys?.length) await assertUploadedImages(userId, 'REVIEW', body.imageKeys);

  const { updated, rewards, achievements } = await prisma.$transaction(async (tx) => {
    const updated = await writeDetail(tx, review.id, body, now);
    const granted = await grantDetailRewards(
      tx,
      updated,
      visit.restaurant?.name ?? '',
      visit.seasonId,
      now,
    );
    await refreshRestaurantStat(tx, review.restaurantId, now);
    return { updated, ...granted };
  });
  const [card] = await toReviewCards(
    [
      await prisma.review.findUniqueOrThrow({
        where: { id: updated.id },
        include: reviewCardInclude,
      }),
    ],
    userId,
  );
  return {
    review: card,
    rewards: { point: rewards.point, levelUp: rewards.levelUp },
    achievements,
  };
}

/** REVIEW-03 음식점 리뷰 목록 (공개 리뷰만, 내가 차단한 사람 제외) */
export async function listRestaurantReviews(
  viewerId: bigint,
  restaurantId: number,
  query: RestaurantReviewQuery,
) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: BigInt(restaurantId) },
    select: { id: true, status: true },
  });
  if (!restaurant || restaurant.status === 'H')
    throw new AppError(RestaurantError.RESTAURANT_NOT_FOUND);
  const blocked = await blockedIdsOf(viewerId);
  const where: Prisma.ReviewWhereInput = {
    restaurantId: restaurant.id,
    status: 'A',
    userId: blocked.length ? { notIn: blocked } : undefined,
    imageCount: query.photoOnly ? { gt: 0 } : undefined,
    visit: query.localOnly ? { isLocal: true } : undefined,
    overallScore: query.revisitOnly ? { gte: REVISIT_INTENT_MIN_SCORE } : undefined,
  };
  const orderBy: Prisma.ReviewOrderByWithRelationInput[] = {
    LATEST: [{ regDate: 'desc' as const }],
    HELPFUL: [{ helpfulCount: 'desc' as const }, { regDate: 'desc' as const }],
    SCORE_HIGH: [{ overallScore: 'desc' as const }, { regDate: 'desc' as const }],
    SCORE_LOW: [{ overallScore: 'asc' as const }, { regDate: 'desc' as const }],
  }[query.sort];
  const [rows, totalCount] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: [...orderBy, { id: 'desc' }],
      skip: (query.page - 1) * query.size,
      take: query.size,
      include: reviewCardInclude,
    }),
    prisma.review.count({ where }),
  ]);
  return toPageResult(await toReviewCards(rows, viewerId), { ...query, totalCount });
}

/** REVIEW-04 리뷰 상세 */
export async function getReview(viewerId: bigint, reviewId: number) {
  const review = await prisma.review.findUnique({
    where: { id: BigInt(reviewId) },
    include: reviewCardInclude,
  });
  const visible = review && (review.status === 'A' || review.userId === viewerId);
  if (!review || !visible) throw new AppError(ReviewError.REVIEW_NOT_FOUND);
  if (review.userId !== viewerId && (await blockedIdsOf(viewerId)).includes(review.userId)) {
    throw new AppError(ReviewError.REVIEW_NOT_FOUND);
  }
  const [card] = await toReviewCards([review], viewerId);
  return card;
}

async function listUserReviews(viewerId: bigint, authorId: bigint, query: UserReviewQuery) {
  const where: Prisma.ReviewWhereInput = { userId: authorId, status: 'A' };
  const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
    query.sort === 'HELPFUL'
      ? [{ helpfulCount: 'desc' }, { regDate: 'desc' }, { id: 'desc' }]
      : [{ regDate: 'desc' }, { id: 'desc' }];
  const [rows, totalCount] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.size,
      take: query.size,
      include: reviewCardInclude,
    }),
    prisma.review.count({ where }),
  ]);
  return toPageResult(await toReviewCards(rows, viewerId), { ...query, totalCount });
}

/** REVIEW-05 내 리뷰 목록 */
export function listMyReviews(userId: bigint, query: UserReviewQuery) {
  return listUserReviews(userId, userId, query);
}

/** REVIEW-10 탐방러 프로필 리뷰 탭 — 탈퇴·정지 회원은 404, 내가 차단한 회원은 빈 목록 */
export async function listMemberReviews(viewerId: bigint, userId: number, query: UserReviewQuery) {
  const member = await prisma.member.findUnique({
    where: { id: BigInt(userId) },
    select: { id: true, status: true },
  });
  if (!member || member.status !== 'A') throw new AppError(UserError.MEMBER_NOT_FOUND);
  if ((await blockedIdsOf(viewerId)).includes(member.id)) {
    return toPageResult([], { ...query, totalCount: 0 });
  }
  return listUserReviews(viewerId, member.id, query);
}

async function findMyReview(userId: bigint, reviewId: number) {
  const review = await prisma.review.findUnique({
    where: { id: BigInt(reviewId) },
    include: {
      restaurant: { select: { name: true } },
      reviewImages: { select: { imageKey: true } },
    },
  });
  if (!review || review.userId !== userId || review.status === 'D') {
    throw new AppError(ReviewError.REVIEW_NOT_FOUND);
  }
  return review;
}

/** REVIEW-06 리뷰 수정 (보낸 항목만) */
export async function updateReview(
  userId: bigint,
  reviewId: number,
  body: ReviewUpdateBody,
  now = new Date(),
) {
  if (Object.values(body).every((v) => v === undefined))
    throw new AppError(ReviewError.NO_FIELDS_TO_UPDATE);
  const review = await findMyReview(userId, reviewId);
  await assertAspects(body.aspects);
  const oldKeys = review.reviewImages.map((i) => i.imageKey);
  const newKeys = body.imageKeys?.filter((k) => !oldKeys.includes(k)) ?? [];
  if (newKeys.length) await assertUploadedImages(userId, 'REVIEW', newKeys);

  const { rewards } = await prisma.$transaction(async (tx) => {
    if (body.overallScore !== undefined) {
      await tx.review.update({
        where: { id: review.id },
        data: { overallScore: body.overallScore },
      });
    }
    const { overallScore: _score, ...detail } = body;
    let rewards: RewardResult = { point: 0, exp: 0, levelUp: null };
    if (Object.values(detail).some((v) => v !== undefined)) {
      const updated = await writeDetail(tx, review.id, detail, now);
      const visit = await tx.visit.findUniqueOrThrow({
        where: { id: review.visitId },
        select: { seasonId: true },
      });
      rewards = (await grantDetailRewards(tx, updated, review.restaurant.name, visit.seasonId, now))
        .rewards;
    }
    await refreshRestaurantStat(tx, review.restaurantId, now);
    return { rewards };
  });
  if (body.imageKeys !== undefined) {
    for (const key of oldKeys.filter((k) => !body.imageKeys?.includes(k)))
      await deleteObjectQuietly(key);
  }
  const card = await getReview(userId, reviewId);
  return { review: card, rewards: { point: rewards.point, levelUp: rewards.levelUp } };
}

/**
 * REVIEW-07 리뷰 삭제 — 세부평가(세부 별점·좋았던/아쉬웠던 점·글·사진)만 지운다.
 * 종합 별점은 정복 기록이라 남긴다. 받은 먹포인트는 되돌리지 않고, 다시 써도 또 받지 않는다.
 */
export async function deleteReviewDetail(userId: bigint, reviewId: number, now = new Date()) {
  const review = await findMyReview(userId, reviewId);
  await prisma.$transaction(async (tx) => {
    await writeDetail(
      tx,
      review.id,
      { detailScores: null, aspects: [], content: null, imageKeys: [] },
      now,
    );
    await tx.review.update({ where: { id: review.id }, data: { detailRegDate: null } });
    await refreshRestaurantStat(tx, review.restaurantId, now);
  });
  for (const { imageKey } of review.reviewImages) await deleteObjectQuietly(imageKey);
  return { reviewId: review.id, overallScore: review.overallScore.toNumber(), detailDeleted: true };
}

/** REVIEW-11 좋았던 점·아쉬웠던 점 칩 목록 */
export async function listReviewAspects() {
  const rows = await prisma.reviewAspect.findMany({
    where: { status: 'A' },
    orderBy: { sortOrder: 'asc' },
  });
  return { items: rows.map((a) => ({ aspectId: a.id, code: a.code, name: a.name })) };
}
