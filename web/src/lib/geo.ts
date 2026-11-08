// 좁은 범위(수백 m 안) 좌표 계산. 이 거리에서는 평면으로 계산해도 충분하다

import type { Bounds } from '../api/restaurants';
import type { Coords } from './geolocation';

/** 위도 1도의 길이 (m). 경도 1도는 여기에 cos(위도)를 곱한다 */
const M_PER_DEG = 111_320;

/** 한 점 둘레 radiusM 정사각형 영역. 모서리는 radiusM보다 멀어서 받은 뒤 metersBetween으로 다시 거른다 */
export function boundsAround({ lat, lng }: Coords, radiusM: number): Bounds {
  const dLat = radiusM / M_PER_DEG;
  const dLng = radiusM / (M_PER_DEG * Math.cos((lat * Math.PI) / 180));
  return { swLat: lat - dLat, swLng: lng - dLng, neLat: lat + dLat, neLng: lng + dLng };
}

/** 두 점 사이 거리 (m) */
export function metersBetween(a: Coords, b: Coords): number {
  const dy = (a.lat - b.lat) * M_PER_DEG;
  const dx = (a.lng - b.lng) * M_PER_DEG * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}
