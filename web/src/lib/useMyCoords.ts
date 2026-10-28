import { useEffect, useState } from 'react';
import { getCurrentCoords, type Coords } from './geolocation';

/** 위치를 기다리는 최대 시간. 못 받으면 거리 없이 보여 준다 */
const WAIT_MS = 5_000;

let cached: Coords | null | undefined;
let pending: Promise<Coords | null> | null = null;

/** 내 위치를 한 번만 묻고 앱이 켜져 있는 동안 기억한다. 권한이 없거나 실패하면 null */
export function requestMyCoords(): Promise<Coords | null> {
  if (cached !== undefined) return Promise.resolve(cached);
  pending ??= getCurrentCoords(WAIT_MS).then(
    (coords) => (cached = coords),
    () => (cached = null),
  );
  return pending;
}

/**
 * 가게까지 거리·가까운 순 정렬에 쓰는 내 위치.
 * ready가 true가 되면 coords(없으면 null)로 서버에 물으면 된다.
 */
export function useMyCoords() {
  const [coords, setCoords] = useState<Coords | null | undefined>(cached);
  useEffect(() => {
    if (cached !== undefined) return;
    let alive = true;
    void requestMyCoords().then((c) => alive && setCoords(c));
    return () => {
      alive = false;
    };
  }, []);
  return { coords: coords ?? null, ready: coords !== undefined };
}

/** 테스트에서 위치를 정한다 (undefined면 다시 묻는다) */
export function setMyCoordsForTest(coords: Coords | null | undefined) {
  cached = coords;
  pending = null;
}
