// 저장한 맛집 API (LIST-02·03)

import { api } from '../lib/api';

/** LIST-02 가고 싶은 곳에 저장 */
export const saveRestaurant = (restaurantId: number) =>
  api.put<unknown>(`/users/me/saved-restaurants/${restaurantId}`, {});

/** LIST-03 저장 취소 */
export const unsaveRestaurant = (restaurantId: number) =>
  api.delete<unknown>(`/users/me/saved-restaurants/${restaurantId}`);
