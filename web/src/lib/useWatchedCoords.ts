import { useEffect, useRef, useState } from 'react';
import type { Coords, LocationError } from './geolocation';

type Handlers = {
  /** 위치를 받을 때마다 (지도를 내 위치로 옮기는 등 그때 할 일) */
  onFix?: (coords: Coords) => void;
  onError?: (error: LocationError) => void;
};

/** 위치 권한을 이미 허용했는지 (묻지 않고 확인). 알 수 없으면 false */
export async function geolocationGranted() {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    return status?.state === 'granted';
  } catch {
    return false;
  }
}

/**
 * 켜져 있는 동안 내 위치를 계속 받는다 (홈 지도의 내 위치 먹깨비).
 * 화면을 떠나거나 끄면 그만 받는다. 위치를 못 쓰는 브라우저면 coords는 계속 null
 */
export function useWatchedCoords(enabled: boolean, handlers: Handlers = {}) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!enabled || !('geolocation' in navigator)) return;
    const geo = navigator.geolocation;
    const id = geo.watchPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(next);
        latest.current.onFix?.(next);
      },
      (err) =>
        latest.current.onError?.(err.code === err.PERMISSION_DENIED ? 'DENIED' : 'UNAVAILABLE'),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => geo.clearWatch(id);
  }, [enabled]);

  return coords;
}
