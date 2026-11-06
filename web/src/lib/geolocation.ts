// 브라우저 위치 (현재 위치로 동네 찾기, 가까운 순 정렬)

export type Coords = { lat: number; lng: number };

export type LocationError = 'DENIED' | 'UNAVAILABLE';

/** 지금 위치. 권한을 막았으면 'DENIED', 그 밖의 실패는 'UNAVAILABLE'로 reject */
export function getCurrentCoords(timeoutMs = 10_000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject('UNAVAILABLE' satisfies LocationError);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        reject(
          (err.code === err.PERMISSION_DENIED ? 'DENIED' : 'UNAVAILABLE') satisfies LocationError,
        ),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

/** 방문 인증용 정확한 지금 위치 (오래된 위치를 쓰지 않는다). 정확도(m)도 같이 */
export function getPreciseCoords(timeoutMs = 15_000): Promise<Coords & { accuracyM: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject('UNAVAILABLE' satisfies LocationError);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Math.min(5000, Math.round(pos.coords.accuracy)),
        }),
      (err) =>
        reject(
          (err.code === err.PERMISSION_DENIED ? 'DENIED' : 'UNAVAILABLE') satisfies LocationError,
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
