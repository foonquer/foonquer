import type { Tx } from '../../common/db';
import { AppError } from '../../common/errors/app-error';
import { addDays, kstStartOfMonth, kstStartOfToday } from '../../common/time';
import { prisma } from '../../lib/prisma';
import { checkAchievements } from '../achievement/achievement.service';
import { notify } from '../notification/notify';
import { refreshReviewWeight, refreshRestaurantStat } from '../restaurant/restaurant-stat-calc';
import { grantReward } from '../reward/reward.service';
import type { ReactionBody } from './review.schema';
import { ReviewError } from './review.errors';
import { changeTrustTemp, voterScale } from './trust-temp';

// REVIEW-08·09 도움돼요·별로예요 (ERD review_reaction, 「신뢰 온도 · 가중 별점 계산식」)
// - 자기 리뷰에는 못 누른다. 별로예요는 그 가게를 방문 인증한 사람만, 수는 비공개
// - 같은 사람이 같은 작성자에게 준 반응은 도움돼요 4주(28일)에 3번, 별로예요 한 달에 1번까지만 계산에 넣는다(is_counted)
// - 도움돼요(계산에 넣는 것): 작성자 온도 방문자 +0.3° / 비방문자 +0.075° × 누른 사람 온도 ÷ 50, 작성자 +5P(도움돼요 받기)
// - 누른 사람은 평가 참여 +5P (하루 10번, 한 리뷰에 한 번)
// - 별로예요 N ≥ 5이고 N ≥ 2H면 작성자 온도 −0.5° (리뷰당 1번)
// - 취소해도 행은 남기고(type N), 이미 바뀐 온도·포인트는 되돌리지 않는다

const MONTHLY_LIMIT = { H: 3, U: 1 } as const;
/** 도움돼요 한도를 세는 기간 (신뢰 별점 검증 보고서: 같은 사람의 도움돼요 4주 3회까지) */
const HELPFUL_WINDOW_DAYS = 28;
const UNHELPFUL_MIN = 5;
const TYPE_CODE = { HELPFUL: 'H', UNHELPFUL: 'U' } as const;

async function findReactable(reviewId: number) {
  const review = await prisma.review.findUnique({
    where: { id: BigInt(reviewId) },
    select: {
      id: true,
      userId: true,
      restaurantId: true,
      status: true,
      restaurant: { select: { name: true } },
    },
  });
  if (!review || review.status !== 'A') throw new AppError(ReviewError.REVIEW_NOT_FOUND);
  return review;
}

async function lockReview(tx: Tx, reviewId: bigint) {
  await tx.$queryRaw`SELECT id FROM review WHERE id = ${reviewId} FOR UPDATE`;
}

/** 리뷰의 반응 수를 review_reaction에서 다시 센다 */
async function recountReactions(tx: Tx, reviewId: bigint) {
  const [helpful, visitorHelpful, unhelpful] = await Promise.all([
    tx.reviewReaction.count({ where: { reviewId, type: 'H' } }),
    tx.reviewReaction.count({ where: { reviewId, type: 'H', isVisitor: true, isCounted: true } }),
    tx.reviewReaction.count({ where: { reviewId, type: 'U', isCounted: true } }),
  ]);
  return tx.review.update({
    where: { id: reviewId },
    data: { helpfulCount: helpful, visitorHelpfulCount: visitorHelpful, unhelpfulCount: unhelpful },
    select: { helpfulCount: true, visitorHelpfulCount: true, unhelpfulCount: true },
  });
}

/**
 * 같은 사람이 같은 작성자의 다른 리뷰에 준 같은 반응 중 계산에 넣은 수 (도움돼요 최근 28일, 별로예요 이번 달).
 * 도움돼요는 이미 준 효과(온도 기록)로 센다 — 취소하고 다른 리뷰에 다시 눌러 한도를 피하지 못하게
 */
async function countedRecently(
  tx: Tx,
  actorId: bigint,
  authorId: bigint,
  type: 'H' | 'U',
  exceptReviewId: bigint,
  exceptReactionId: bigint | undefined,
  now: Date,
) {
  if (type === 'H') {
    return tx.trustTempLog.count({
      where: {
        userId: authorId,
        actorId,
        reason: { in: ['HELPFUL_VISITOR', 'HELPFUL_GUEST'] },
        regDate: { gte: addDays(now, -HELPFUL_WINDOW_DAYS) },
        ...(exceptReactionId ? { NOT: { refId: exceptReactionId } } : {}),
      },
    });
  }
  return tx.reviewReaction.count({
    where: {
      userId: actorId,
      type,
      isCounted: true,
      reviewId: { not: exceptReviewId },
      review: { userId: authorId },
      updateDate: { gte: kstStartOfMonth(now) },
    },
  });
}

/** 도움돼요 알림은 같은 리뷰·같은 날이면 하나로 모은다 ("새맛집 리뷰에 도움돼요 3개") */
async function notifyHelpful(
  tx: Tx,
  authorId: bigint,
  reviewId: bigint,
  restaurantName: string,
  helpfulCount: number,
  now: Date,
) {
  const existing = await tx.notification.findFirst({
    where: {
      userId: authorId,
      type: 'HELPFUL',
      refType: 'REVIEW',
      refId: reviewId,
      isRead: false,
      regDate: { gte: kstStartOfToday(now) },
    },
    select: { id: true },
  });
  const title = `${restaurantName} 리뷰에 도움돼요 ${helpfulCount}개`;
  if (existing) {
    await tx.notification.update({
      where: { id: existing.id },
      data: { title: title.slice(0, 60), regDate: now },
    });
    return;
  }
  await notify(
    tx,
    authorId,
    {
      category: 'REVIEW',
      type: 'HELPFUL',
      title,
      content: '내 리뷰가 다른 탐험가에게 도움이 됐어요',
      refType: 'REVIEW',
      refId: reviewId,
    },
    now,
  );
}

/** REVIEW-08 도움돼요·별로예요 등록 및 변경 */
export async function reactToReview(
  userId: bigint,
  reviewId: number,
  body: ReactionBody,
  now = new Date(),
) {
  const review = await findReactable(reviewId);
  if (review.userId === userId) throw new AppError(ReviewError.OWN_REVIEW);
  const type = TYPE_CODE[body.type];
  const isVisitor =
    (await prisma.visit.count({
      where: { userId, restaurantId: review.restaurantId, status: { in: ['V', 'C'] } },
    })) > 0;
  if (type === 'U' && !isVisitor) throw new AppError(ReviewError.VISIT_REQUIRED);

  const counts = await prisma.$transaction(async (tx) => {
    // 같은 리뷰의 반응을 한 줄로 세워 수가 어긋나거나 첫 반응이 겹쳐 500이 나지 않게 한다
    await lockReview(tx, review.id);
    const existing = await tx.reviewReaction.findUnique({
      where: { reviewId_userId: { reviewId: review.id, userId } },
    });
    if (existing?.type === type) {
      return tx.review.findUniqueOrThrow({
        where: { id: review.id },
        select: { helpfulCount: true, visitorHelpfulCount: true, unhelpfulCount: true },
      });
    }
    const isCounted =
      (await countedRecently(tx, userId, review.userId, type, review.id, existing?.id, now)) <
      MONTHLY_LIMIT[type];
    const reaction = existing
      ? await tx.reviewReaction.update({
          where: { id: existing.id },
          data: { type, isVisitor, isCounted, updateDate: now },
        })
      : await tx.reviewReaction.create({
          data: {
            reviewId: review.id,
            userId,
            type,
            isVisitor,
            isCounted,
            regDate: now,
            updateDate: now,
          },
        });
    const counts = await recountReactions(tx, review.id);

    await grantReward(
      tx,
      userId,
      'REVIEW_VOTE',
      '리뷰 평가 참여',
      { type: 'REVIEW_REACTION', id: reaction.id },
      now,
    );
    if (type === 'H' && isCounted) {
      const voter = await tx.member.findUniqueOrThrow({
        where: { id: userId },
        select: { trustTemp: true },
      });
      await changeTrustTemp(
        tx,
        review.userId,
        isVisitor ? 'HELPFUL_VISITOR' : 'HELPFUL_GUEST',
        { type: 'REVIEW_REACTION', id: reaction.id },
        userId,
        now,
        voterScale(voter.trustTemp.toNumber()),
      );
      await grantReward(
        tx,
        review.userId,
        'HELPFUL_RECEIVED',
        `${review.restaurant.name} 리뷰 도움돼요`,
        { type: 'REVIEW_REACTION', id: reaction.id },
        now,
      );
      await notifyHelpful(
        tx,
        review.userId,
        review.id,
        review.restaurant.name,
        counts.helpfulCount,
        now,
      );
      await checkAchievements(tx, review.userId, ['HELPFUL_RECEIVED'], null, now);
    }
    if (
      counts.unhelpfulCount >= UNHELPFUL_MIN &&
      counts.unhelpfulCount >= 2 * counts.visitorHelpfulCount
    ) {
      await changeTrustTemp(
        tx,
        review.userId,
        'UNHELPFUL_MANY',
        { type: 'REVIEW', id: review.id },
        null,
        now,
      );
    }
    await refreshReviewWeight(tx, review.id);
    await refreshRestaurantStat(tx, review.restaurantId, now);
    return counts;
  });
  return { reviewId: review.id, myReaction: body.type, helpfulCount: counts.helpfulCount };
}

/** REVIEW-09 반응 취소 (멱등) */
export async function cancelReaction(userId: bigint, reviewId: number, now = new Date()) {
  const review = await findReactable(reviewId);
  const counts = await prisma.$transaction(async (tx) => {
    await lockReview(tx, review.id);
    const existing = await tx.reviewReaction.findUnique({
      where: { reviewId_userId: { reviewId: review.id, userId } },
    });
    if (existing && existing.type !== 'N') {
      await tx.reviewReaction.update({
        where: { id: existing.id },
        data: { type: 'N', updateDate: now },
      });
    }
    const counts = await recountReactions(tx, review.id);
    await refreshReviewWeight(tx, review.id);
    await refreshRestaurantStat(tx, review.restaurantId, now);
    return counts;
  });
  return { reviewId: review.id, myReaction: null, helpfulCount: counts.helpfulCount };
}
