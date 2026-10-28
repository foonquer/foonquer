// 지금 보고 있는 동네 (홈 지도·맛집 검색·추천맛집이 같이 쓴다).
// 처음에는 내 동네 첫 번째 곳, 지역 선택 시트에서 바꾸면 이 기기에 기억한다.

import { useEffect, useSyncExternalStore } from 'react';
import { searchDongs, type Dong } from '../api/regions';
import { getMe } from '../api/users';
import { getSession, subscribeSession } from './session';
import { readJson, writeJson } from './storage';

export type ViewRegion = {
  regionId: number;
  dongName: string;
  sigunguName: string;
  /** 동 중심 좌표 (지도 처음 위치). 모르면 null */
  lat: number | null;
  lng: number | null;
};

type RegionState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; region: ViewRegion }
  | { status: 'error'; error: unknown };

const STORAGE_KEY = 'mk:view-region';
/** 동 중심을 모를 때 지도 위치 (서울시청) */
export const SEOUL_CENTER = { lat: 37.5666, lng: 126.9784 };

const saved = readJson<ViewRegion | null>(STORAGE_KEY, null);
let state: RegionState = saved ? { status: 'ready', region: saved } : { status: 'idle' };
const listeners = new Set<() => void>();

function setState(next: RegionState) {
  state = next;
  listeners.forEach((l) => l());
}

// 로그아웃하면 다음에 로그인한 사람의 내 동네로 다시 시작한다
subscribeSession(() => {
  if (getSession().status === 'guest' && state.status !== 'idle') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 지우지 못해도 화면 상태는 비운다.
    }
    setState({ status: 'idle' });
  }
});

export function toViewRegion(dong: Dong): ViewRegion {
  return {
    regionId: dong.regionId,
    dongName: dong.dongName,
    sigunguName: dong.sigunguName,
    lat: dong.centerLat,
    lng: dong.centerLng,
  };
}

/** 지역 선택 시트에서 고른 동네로 바꾼다 */
export function setViewRegion(region: ViewRegion) {
  writeJson(STORAGE_KEY, region);
  setState({ status: 'ready', region });
}

/** 내 동네 첫 번째 곳을 읽고(USER-04), 그 동의 중심 좌표를 찾는다(REGION-01) */
async function loadMyFirstRegion() {
  setState({ status: 'loading' });
  try {
    const me = await getMe();
    const first = [...me.localRegions].sort((a, b) => a.sortOrder - b.sortOrder)[0];
    if (!first) throw new Error('NO_LOCAL_REGION');
    const found = await searchDongs(`${first.sigunguName} ${first.dongName}`, 5).catch(() => null);
    const dong = found?.items.find((d) => d.regionId === first.regionId);
    setState({
      status: 'ready',
      region: {
        regionId: first.regionId,
        dongName: first.dongName,
        sigunguName: first.sigunguName,
        lat: dong?.centerLat ?? null,
        lng: dong?.centerLng ?? null,
      },
    });
  } catch (error) {
    setState({ status: 'error', error });
  }
}

/** 보고 있는 동네. 아직 없으면 내 동네를 불러온다 */
export function useViewRegion() {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  useEffect(() => {
    if (state.status === 'idle') void loadMyFirstRegion();
  }, []);
  return {
    region: current.status === 'ready' ? current.region : null,
    error: current.status === 'error' ? current.error : null,
    retry: loadMyFirstRegion,
  };
}

/** "강서구 · 가양동" */
export const regionLabel = (r: { sigunguName: string; dongName: string }) =>
  `${r.sigunguName} · ${r.dongName}`;

/** 테스트에서 처음 상태로 */
export function resetViewRegionForTest(region: ViewRegion | null = null) {
  setState(region ? { status: 'ready', region } : { status: 'idle' });
}
