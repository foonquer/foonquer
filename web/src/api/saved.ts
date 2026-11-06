// 저장한 맛집 API (LIST-01~03)

import { api } from '../lib/api';

export type SavedTab = 'WANT' | 'CONQUERED';

export type SavedRestaurant = {
  restaurantId: number;
  name: string;
  categoryName: string | null;
  /** "서울 강서구" */
  regionLabel: string;
  dongName: string;
  lat: number;
  lng: number;
  isClosed: boolean;
  memo: string | null;
  remind: boolean;
  savedAt: string;
  savedDaysAgo: number;
  conqueredAt: string | null;
};

/** LIST-01 저장한 맛집 (가고 싶은 곳 / 정복한 곳) + 지도 핀 */
export const getSavedRestaurants = (query: { tab: SavedTab; page?: number; size?: number }) =>
  api.get<{
    summary: { totalCount: number; wantCount: number; conqueredCount: number };
    pins: { restaurantId: number; name: string; lat: number; lng: number; conquered: boolean }[];
    items: SavedRestaurant[];
    page: number;
    size: number;
    totalCount: number;
    hasNext: boolean;
  }>('/users/me/saved-restaurants', query);

/** LIST-02 가고 싶은 곳에 저장 (메모 50자, remind면 2주 뒤에 알려 준다) */
export const saveRestaurant = (
  restaurantId: number,
  body: { memo?: string | null; remind?: boolean } = {},
) => api.put<unknown>(`/users/me/saved-restaurants/${restaurantId}`, body);

/** LIST-03 저장 취소 */
export const unsaveRestaurant = (restaurantId: number) =>
  api.delete<unknown>(`/users/me/saved-restaurants/${restaurantId}`);
