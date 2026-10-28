// 동네 찾기 API (REGION-01·02)

import { api } from '../lib/api';
import { getCurrentCoords } from '../lib/geolocation';

export type Dong = {
  regionId: number;
  dongName: string;
  sigunguId: number;
  sigunguName: string;
  fullName: string;
  centerLat: number | null;
  centerLng: number | null;
};

/** REGION-01 동 이름으로 찾기 (서울만, 최대 50개) */
export const searchDongs = (keyword: string, limit = 20) =>
  api.get<{ keyword: string; items: Dong[]; totalCount: number }>('/regions/search', {
    keyword,
    limit,
  });

/** REGION-02 좌표로 지금 동네 찾기 */
export const findCurrentDong = (lat: number, lng: number) =>
  api.get<Dong>('/regions/current', { lat, lng });

/** 기기 위치로 지금 동네 찾기. 위치 권한이 막히면 'DENIED', 위치를 못 찾으면 'UNAVAILABLE'로 실패 */
export async function findDongHere() {
  const coords = await getCurrentCoords();
  return findCurrentDong(coords.lat, coords.lng);
}
