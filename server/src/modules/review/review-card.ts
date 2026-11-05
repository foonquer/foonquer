import { findCurrentSeason } from '../../common/season';
import { toKstIso, toKstIsoOrNull } from '../../common/time';
import type { Prisma } from '../../generated/prisma/client';
import { publicImageUrl } from '../../lib/image-url';
import { prisma } from '../../lib/prisma';
import { loadTitles, titleOf } from '../ranking/title';

/** 리뷰 카드에 필요한 관계 (REVIEW-03·04·05·10 공통) */
export const reviewCardInclude = {
  user: {
    select: { id: true, nickname: true, profileImageKey: true, trustTemp: true, status: true },
  },
  visit: { select: { method: true, isLocal: true, verifiedAt: true } },
  reviewImages: { orderBy: { sortOrder: 'asc' }, select: { imageKey: true } },
  aspectMarks: {
    orderBy: { aspect: { sortOrder: 'asc' } },
    select: { polarity: true, aspect: { select: { id: true, name: true } } },
  },
  restaurant: {
    select: {
      id: true,
      name: true,
      category: { select: { name: true } },
      sigungu: { select: { name: true } },
      region: { select: { name: true } },
    },
  },
} satisfies Prisma.ReviewInclude;

export type ReviewCardRow = Prisma.ReviewGetPayload<{ include: typeof reviewCardInclude }>;

const WITHDRAWN_NAME = '탈퇴한 탐험가';
const REACTION_API: Record<string, 'HELPFUL' | 'UNHELPFUL'> = { H: 'HELPFUL', U: 'UNHELPFUL' };

/**
 * 리뷰 카드 목록. 별로예요 수(unhelpful_count)는 비공개라 내려주지 않는다.
 * 작성자: 닉네임·사진·신뢰 온도·대표 칭호, 그 가게 기준 로컬 여부(visit.is_local), 인증 방식
 */
export async function toReviewCards(rows: ReviewCardRow[], viewerId: bigint) {
  if (rows.length === 0) return [];
  const season = await findCurrentSeason();
  const authorIds = [...new Set(rows.map((r) => r.userId))];
  const [titles, myReactions] = await Promise.all([
    loadTitles(authorIds, season?.id ?? null),
    prisma.reviewReaction.findMany({
      where: {
        userId: viewerId,
        reviewId: { in: rows.map((r) => r.id) },
        type: { in: ['H', 'U'] },
      },
      select: { reviewId: true, type: true },
    }),
  ]);
  const reactionOf = new Map(myReactions.map((r) => [r.reviewId.toString(), REACTION_API[r.type]]));

  return rows.map((r) => {
    const withdrawn = r.user.status === 'D';
    return {
      reviewId: r.id,
      restaurant: {
        restaurantId: r.restaurant.id,
        name: r.restaurant.name,
        categoryName: r.restaurant.category?.name ?? null,
        sigunguName: r.restaurant.sigungu.name,
        dongName: r.restaurant.region.name,
      },
      author: {
        userId: withdrawn ? null : r.user.id,
        nickname: withdrawn ? WITHDRAWN_NAME : r.user.nickname,
        profileImageUrl: withdrawn ? null : publicImageUrl(r.user.profileImageKey),
        trustTemp: withdrawn ? null : r.user.trustTemp.toNumber(),
        title: withdrawn ? null : titleOf(titles, r.user.id),
        isLocal: r.visit.isLocal,
      },
      verificationMethod: r.visit.method === 'R' ? 'RECEIPT' : 'ON_SITE',
      visitedAt: toKstIsoOrNull(r.visit.verifiedAt),
      overallScore: r.overallScore.toNumber(),
      detailScores:
        r.taste === null
          ? null
          : {
              taste: r.taste,
              cleanliness: r.cleanliness,
              portion: r.portion,
              service: r.service,
              price: r.price,
            },
      aspects: r.aspectMarks.map((m) => ({
        aspectId: m.aspect.id,
        name: m.aspect.name,
        polarity: m.polarity as 'G' | 'B',
      })),
      content: r.content,
      imageUrls: r.reviewImages
        .map((i) => publicImageUrl(i.imageKey))
        .filter((u): u is string => u !== null),
      imageCount: r.imageCount,
      helpfulCount: r.helpfulCount,
      myReaction: reactionOf.get(r.id.toString()) ?? null,
      isMine: r.userId === viewerId,
      isRevisit: r.isRevisit,
      regDate: toKstIso(r.regDate),
      updatedAt: toKstIsoOrNull(r.detailRegDate ?? r.contentRegDate),
    };
  });
}
