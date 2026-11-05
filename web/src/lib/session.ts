// 로그인 상태.
// accessToken은 자바스크립트 메모리에만 둔다 (localStorage에 두면 XSS로 털릴 수 있다).
// refreshToken은 서버가 httpOnly 쿠키(Path=/api/v1/auth)로 주므로 웹 코드는 볼 수 없고,
// 새로 고침하면 POST /auth/refresh로 accessToken을 다시 받는다.

import { useSyncExternalStore } from 'react';
import { API_PREFIX } from './config';

/** 로그인 뒤 가야 할 곳 (명세서 nextAction) */
export type NextAction = 'HOME' | 'TERMS_REQUIRED' | 'PROFILE_REQUIRED';

export type Session =
  | { status: 'loading' } // 앱을 막 열어 로그인 복구 중
  | { status: 'guest' }
  | { status: 'authed'; nextAction: NextAction };

let accessToken: string | null = null;
let session: Session = { status: 'loading' };
/** 로그인·로그아웃할 때마다 1씩 는다. 늦게 끝난 재발급이 그사이의 로그인을 덮어쓰지 않게 한다 */
let generation = 0;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function setSession(next: Session) {
  session = next;
  listeners.forEach((listener) => listener());
}

export function getAccessToken() {
  return accessToken;
}

export function getSession() {
  return session;
}

/** 카카오 로그인·토큰 재발급이 성공했을 때 */
export function signIn(token: string, nextAction: NextAction) {
  generation += 1;
  accessToken = token;
  setSession({ status: 'authed', nextAction });
}

/** 약관 동의·프로필 설정을 마쳐서 다음 단계가 바뀌었을 때 */
export function setNextAction(nextAction: NextAction) {
  if (session.status === 'authed' && session.nextAction !== nextAction) {
    setSession({ status: 'authed', nextAction });
  }
}

/** 로그아웃·재발급 실패. 서버 쿠키는 POST /auth/logout이 지운다 */
export function signOut() {
  generation += 1;
  accessToken = null;
  setSession({ status: 'guest' });
}

type RefreshBody =
  | { success: true; data: { accessToken: string; nextAction: NextAction } }
  | { success: false; code: string };

/**
 * refreshToken 쿠키로 accessToken을 다시 받는다 (AUTH-10). 앱을 열 때와 accessToken이 만료됐을 때 부른다.
 * 여러 요청이 동시에 TOKEN_EXPIRED를 받아도 서버에는 한 번만 보낸다.
 * (refreshToken은 쓸 때마다 바뀌어서, 두 번 보내면 두 번째는 재사용으로 걸려 모든 기기가 로그아웃된다)
 */
export function refreshAccessToken(): Promise<boolean> {
  refreshing ??= (async () => {
    const startedAt = generation;
    try {
      const res = await fetch(`${API_PREFIX}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      const body = (await res.json().catch(() => null)) as RefreshBody | null;
      if (startedAt !== generation) return session.status === 'authed';
      if (body?.success) {
        signIn(body.data.accessToken, body.data.nextAction);
        return true;
      }
      // 서버가 refreshToken을 거절했을 때(401·403)만 로그아웃한다.
      // 배포 중 502·503, 429, JSON이 아닌 응답 같은 일시적 실패는 로그인 상태를 그대로 둔다.
      if (res.status === 401 || res.status === 403 || session.status === 'loading') signOut();
      return false;
    } catch {
      // 서버에 닿지 않았다. 로그인 중이던 정보는 지우지 않고 실패만 알린다.
      if (startedAt === generation && session.status === 'loading') signOut();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** 로그인 상태가 바뀔 때마다 listener를 부른다 (React 밖에서 쓸 때) */
export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession() {
  return useSyncExternalStore(subscribeSession, getSession);
}

/** 테스트에서 로그인 상태를 정한다 */
export function resetSessionForTest(next: Session = { status: 'loading' }, token?: string) {
  generation += 1;
  accessToken = token ?? null;
  refreshing = null;
  setSession(next);
}
