// 별점·리뷰 API (REVIEW-01~10)

import { api, type Query } from '../lib/api';

export type LevelUp = { from: number; to: number; itemBoxCount: number };
export type Rewards = { point: number; levelUp: LevelUp | null };

export type UnlockedAchievement = {
  achievementId: number;
  code: string;
  name: string;
  rewardPoint: number;
  rewardItems: { itemId: number; code: string; name: string }[];
};

export type Page<T> = {
  items: T[];
  page: number;
  size: number;
  totalCount: number;
  hasNext: boolean;
};

/** 세부 별점 4항목 (맛은 맛 별점 overallScore로 따로) */
export type DetailScores = { cleanliness: number; portion: number; service: number; price: number };

export type ReviewAspectMark = { aspectId: number; name: string; polarity: 'G' | 'B' };

export type Review = {
  reviewId: number;
  restaurant: {
    restaurantId: number;
    name: string;
    categoryName: string | null;
    sigunguName: string;
    dongName: string;
  };
  author: {
    /** 탈퇴한 사람이면 null */
    userId: number | null;
    nickname: string | null;
    profileImageUrl: string | null;
    trustTemp: number | null;
    title: string | null;
    isLocal: boolean;
  };
  verificationMethod: 'RECEIPT' | 'ON_SITE';
  visitedAt: string | null;
  /** 맛 별점 (0.5 ~ 5.0) */
  overallScore: number;
  detailScores: DetailScores | null;
  aspects: ReviewAspectMark[];
  content: string | null;
  imageUrls: string[];
  imageCount: number;
  helpfulCount: number;
  myReaction: 'HELPFUL' | 'UNHELPFUL' | null;
  isMine: boolean;
  isRevisit: boolean;
  regDate: string;
  updatedAt: string | null;
};

export type RatingResult = {
  reviewId: number;
  visitId: number;
  overallScore: number;
  restaurant: { restaurantId: number; name: string };
  conquest: {
    isNewConquest: boolean;
    isFirstEver: boolean;
    sigunguId: number;
    sigunguName: string;
    conquestCount: number | null;
    rank: number | null;
    topPercent: number | null;
    tier: string | null;
    tierTitle: string | null;
  };
  rewards: Rewards;
  celebrations: {
    tierUp: { from: string; to: string; tierTitle: string } | null;
    backgroundUnlocked: { sigunguId: number; sigunguName: string; bgKey: string | null } | null;
    achievements: UnlockedAchievement[];
  };
};

/** REVIEW-01 맛 별점 등록 → 정복 완료 */
export const rateVisit = (visitId: number, overallScore: number) =>
  api.post<RatingResult>(`/visits/${visitId}/rating`, { overallScore });

export type ReviewDetailBody = {
  detailScores?: DetailScores;
  aspects?: { aspectId: number; polarity: 'G' | 'B' }[];
  content?: string;
  imageKeys?: string[];
};

/** REVIEW-02 세부평가 (세부 별점·좋았던/아쉬웠던 점·글·사진, 한 번만) */
export const addReviewDetail = (visitId: number, body: ReviewDetailBody) =>
  api.post<{ review: Review; rewards: Rewards; achievements: UnlockedAchievement[] }>(
    `/visits/${visitId}/review`,
    body,
  );

/** REVIEW-04 리뷰 상세 */
export const getReview = (reviewId: number) => api.get<Review>(`/reviews/${reviewId}`);

/** REVIEW-06 리뷰 수정 (보낸 항목만. detailScores·content는 null이면 지운다) */
export const updateReview = (
  reviewId: number,
  body: {
    overallScore?: number;
    detailScores?: DetailScores | null;
    aspects?: { aspectId: number; polarity: 'G' | 'B' }[];
    content?: string | null;
    imageKeys?: string[];
  },
) => api.patch<{ review: Review; rewards: Rewards }>(`/reviews/${reviewId}`, body);

/** REVIEW-07 리뷰 삭제 (세부평가만 지우고 맛 별점·정복 기록은 남는다) */
export const deleteReview = (reviewId: number) =>
  api.delete<{ reviewId: number; overallScore: number; detailDeleted: true }>(
    `/reviews/${reviewId}`,
  );

type ReactionResult = {
  reviewId: number;
  myReaction: 'HELPFUL' | 'UNHELPFUL' | null;
  helpfulCount: number;
};

/** REVIEW-08 도움돼요·별로예요 (별로예요 수는 공개하지 않는다) */
export const reactReview = (reviewId: number, type: 'HELPFUL' | 'UNHELPFUL') =>
  api.put<ReactionResult>(`/reviews/${reviewId}/reaction`, { type });

/** REVIEW-09 반응 취소 */
export const cancelReaction = (reviewId: number) =>
  api.delete<ReactionResult>(`/reviews/${reviewId}/reaction`);

export type RestaurantReviewSort = 'LATEST' | 'HELPFUL' | 'SCORE_HIGH' | 'SCORE_LOW';

/** REVIEW-03 가게 리뷰 목록 */
export const getRestaurantReviews = (
  restaurantId: number,
  query: {
    sort?: RestaurantReviewSort;
    photoOnly?: boolean;
    localOnly?: boolean;
    page?: number;
    size?: number;
  } = {},
) => api.get<Page<Review>>(`/restaurants/${restaurantId}/reviews`, query as Query);

/** REVIEW-05 내 리뷰 목록 */
export const getMyReviews = (query: {
  sort?: 'LATEST' | 'HELPFUL';
  page?: number;
  size?: number;
}) => api.get<Page<Review>>('/users/me/reviews', query);

/** 좋았던 점·아쉬웠던 점 칩 (맛·양·가격·서비스·청결·대기시간·분위기) */
export const getReviewAspects = () =>
  api.get<{ items: { aspectId: number; code: string; name: string }[] }>('/review-aspects');
