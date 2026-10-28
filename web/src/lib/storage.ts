// 이 브라우저에만 남기는 작은 값 (온보딩을 봤는지, 최근 검색어).
// 사생활 보호 모드 등에서는 localStorage가 막혀 있을 수 있어 실패해도 앱이 멈추지 않게 한다.

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장하지 못해도 화면은 그대로 쓴다.
  }
}

const ONBOARDING_KEY = 'mk:onboarding-seen';

export const onboarding = {
  seen: () => readJson(ONBOARDING_KEY, false),
  markSeen: () => writeJson(ONBOARDING_KEY, true),
};
