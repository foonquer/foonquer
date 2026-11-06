import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { getSession, refreshAccessToken } from '../lib/session';
import { ToastProvider } from './Toast';

/** 카카오 로그인 콜백은 받은 code로 직접 로그인하므로 앱 시작 때 재발급하지 않는다 */
const SKIP_RESTORE_PATHS = ['/oauth/callback'];

/** 모든 화면의 바깥 틀: 앱을 열 때 로그인을 복구하고, 토스트를 띄울 자리를 둔다 */
export function AppShell() {
  useEffect(() => {
    if (getSession().status !== 'loading') return;
    if (SKIP_RESTORE_PATHS.includes(window.location.pathname)) return;
    void refreshAccessToken();
  }, []);

  return (
    <ToastProvider>
      <Outlet />
    </ToastProvider>
  );
}
