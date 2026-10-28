import { useEffect, useState } from 'react';
import { getCurrentCoords, type Coords } from './geolocation';

/** 위치를 기다리는 최대 시간. 못 받으면 거리 없이 보여 준다 */
const WAIT_MS = 5_000;

let cached: Coords | null | undefined;
let pending: Promise<Coords | null> | null = null;

/** 내 위치를 한 번만 묻고 앱이 켜져 있는 동안 기억한다. 권한이 없거나 실패하면 null */
export function requestMyCoords(): Promise<Coords | null> {
  if (cached !== undefined) return Promise.resolve(cached);
  // getCurrentPosition의 timeout은 권한 팝업에 답하기 전 시간을 세지 않아서, 기다리는 시간은 따로 잰다.
  // 시간이 지나면 이번 실행 동안은 거리 없이 보여 준다 (나중에 허용해도 다시 묻지 않는다).
  pending ??= Promise.race([
    getCurrentCoords(WAIT_MS).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS)),
  ]).then((coords) => (cached = coords));
  return pending;
}

/**
 * 가게까지 거리·가까운 순 정렬에 쓰는 내 위치.
 * ready가 true가 되면 coords(없으면 null)로 서버에 물으면 된다.
 */
export function useMyCoords() {
  const [coords, setCoords] = useState<Coords | null | undefined>(cached);
  useEffect(() => {
    // 이미 받아 두었어도 부른다: 첫 렌더와 effect 사이에 다른 화면이 받아 왔을 수 있다
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
