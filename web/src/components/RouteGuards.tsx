import { Navigate, Outlet, useLocation, type Location } from 'react-router';
import { useSession, type NextAction } from '../lib/session';
import { onboarding } from '../lib/storage';
import { SplashScreen } from './SplashScreen';

/** nextAction별 첫 화면 */
// eslint-disable-next-line react-refresh/only-export-components
export const PATH_OF: Record<NextAction, string> = {
  HOME: '/',
  TERMS_REQUIRED: '/signup/terms',
  PROFILE_REQUIRED: '/profile/setup',
};

type FromState = { from?: Pick<Location, 'pathname' | 'search'> } | null;

/**
 * 로그인했고 지금 단계(step)인 회원만 들어온다.
 * - 로그인 전 → 온보딩(처음) 또는 로그인. 로그인하면 원래 가려던 화면으로 돌아온다.
 * - 약관 동의·프로필 설정이 남았으면 그 화면으로.
 */
export function RequireStep({ step }: { step: NextAction }) {
  const session = useSession();
  const location = useLocation();

  if (session.status === 'loading') return <SplashScreen />;
  if (session.status === 'guest') {
    const to = onboarding.seen() ? '/login' : '/onboarding';
    return <Navigate to={to} replace state={{ from: location } satisfies FromState} />;
  }
  if (session.nextAction !== step) return <Navigate to={PATH_OF[session.nextAction]} replace />;
  return <Outlet />;
}

/** 로그인 전에만 쓰는 화면 (온보딩·로그인·회원가입). 로그인이 끝나면 다음 단계로 보낸다 */
export function GuestOnly() {
  const session = useSession();
  const location = useLocation();

  if (session.status === 'loading') return <SplashScreen />;
  if (session.status === 'authed') {
    const from = (location.state as FromState)?.from;
    const to =
      session.nextAction === 'HOME' && from
        ? `${from.pathname}${from.search}`
        : PATH_OF[session.nextAction];
    return <Navigate to={to} replace />;
  }
  return <Outlet />;
}
