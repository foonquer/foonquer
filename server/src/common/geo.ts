// 명세서 "값 규칙": 좌표는 WGS84 lat/lng, 거리(distanceM)는 정수 미터 직선거리.

/** MySQL ST_Distance_Sphere()와 같은 지구 반지름(m). SQL 정렬과 응답 거리가 어긋나지 않게 맞춘다 */
const EARTH_RADIUS_M = 6_370_986;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/** 두 좌표 사이 직선거리(m, 소수) — haversine */
export function distanceBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 내 위치가 있으면 가게까지 거리(정수 m), 없으면 null */
export function distanceMeters(
  from: { lat?: number; lng?: number },
  to: { lat: number; lng: number },
): number | null {
  if (from.lat === undefined || from.lng === undefined) return null;
  return Math.round(distanceBetween(from.lat, from.lng, to.lat, to.lng));
}
