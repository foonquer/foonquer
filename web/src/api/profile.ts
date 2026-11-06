// 탐방러 프로필·내 PICK API (PROFILE-02, PICK-01·02)

import { api } from '../lib/api';
import type { Page } from './reviews';

export type VisitedRestaurant = {
  restaurantId: number;
  name: string;
  categoryName: string | null;
  sigunguName: string;
  dongName: string;
  /** 맛 별점 (리뷰를 지웠으면 null) */
  overallScore: number | null;
  reviewId: number | null;
  conqueredAt: string;
};

/** PROFILE-02 다녀온 가게 (시즌별, 최근 정복순) */
export const getVisitedRestaurants = (
  userId: number,
  query: { seasonId?: number; page?: number; size?: number },
) =>
  api.get<Page<VisitedRestaurant> & { seasonId: number | null; isMe: boolean }>(
    `/users/${userId}/visited-restaurants`,
    query,
  );

export type Pick = {
  order: number;
  restaurantId: number;
  name: string;
  categoryName: string | null;
  sigunguName: string;
  dongName: string;
  lat: number;
  lng: number;
  comment: string | null;
  visitCount: number;
};

export type PickCandidate = {
  restaurantId: number;
  name: string;
  categoryName: string | null;
  dongName: string;
  visitCount: number;
  isPicked: boolean;
};

/** PICK-01 내 PICK과 고를 수 있는 정복한 가게 */
export const getMyPicks = (query: { keyword?: string; page?: number; size?: number }) =>
  api.get<{ picks: Pick[]; maxPicks: number; candidates: Page<PickCandidate> }>(
    '/users/me/picks',
    query,
  );

/** PICK-02 내 PICK 저장 (순서대로 통째로) */
export const saveMyPicks = (picks: { restaurantId: number; comment: string | null }[]) =>
  api.call<{ picks: Pick[] }>('PUT', '/users/me/picks', { body: { picks } });
