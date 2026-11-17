import { useEffect } from 'react';
import type { HomeSummary } from '../api/home';

type Look = HomeSummary['mukkaebi'];

/** 마지막으로 받은 내 먹깨비 모습 (앱을 연 동안만 기억하고, 로그아웃하면 비운다) */
let last: Look | null = null;

/**
 * 내 먹깨비 모습. 새로 받기 전에는 마지막으로 받은 모습을 보여 줘서
 * 홈·내 정보를 오갈 때 기본 먹깨비가 잠깐 보였다가 내 먹깨비로 바뀌지 않게 한다
 */
export function useMyLook(fresh: Look | undefined): Look | undefined {
  useEffect(() => {
    if (fresh) last = fresh;
  }, [fresh]);
  return fresh ?? last ?? undefined;
}

export function forgetMyLook() {
  last = null;
}
