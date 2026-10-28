import { useEffect, useState } from 'react';
import { logout } from '../../api/auth';
import { getMe, LOGIN_METHOD_LABEL } from '../../api/users';
import { AppHeader } from '../../components/AppHeader';
import { Dialog } from '../../components/Dialog';
import { MenuList, MenuSection } from '../../components/MenuList';
import { Screen } from '../../components/Screen';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { getCurrentCoords } from '../../lib/geolocation';
import { signOut } from '../../lib/session';
import { useAsync } from '../../lib/useAsync';
import styles from './SettingsPage.module.css';

const APP_VERSION = '1.0.0';

type LocationPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

const PERMISSION_LABEL: Record<LocationPermission, string> = {
  granted: '허용됨',
  denied: '꺼짐',
  prompt: '묻기 전',
  unknown: '',
};

/** 브라우저의 위치 권한 상태 (지원하지 않는 브라우저는 unknown) */
function useLocationPermission() {
  const [state, setState] = useState<LocationPermission>('unknown');
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const update = () => status && setState(status.state as LocationPermission);
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((s) => {
        status = s;
        update();
        s.addEventListener('change', update);
      })
      .catch(() => undefined);
    return () => status?.removeEventListener('change', update);
  }, []);
  return [state, setState] as const;
}

/** 설정 /me/settings: 위치 권한·내 동네·연결된 계정·비밀번호 변경·로그아웃(AUTH-11) */
export function SettingsPage() {
  const toast = useToast();
  const me = useAsync(getMe, []);
  const [permission, setPermission] = useLocationPermission();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const regions = me.data?.localRegions ?? [];
  const regionText = regions[0]
    ? `${regions[0].sigunguName} ${regions[0].dongName}${regions.length > 1 ? ` 외 ${regions.length - 1}곳` : ''}`
    : '';
  const methods = me.data?.loginMethods ?? [];
  const hasPassword = methods.includes('EMAIL');

  const askLocation = () => {
    if (permission === 'granted') {
      toast('위치 권한이 켜져 있어요');
      return;
    }
    getCurrentCoords().then(
      () => {
        setPermission('granted');
        toast('위치 권한을 켰어요');
      },
      (err: unknown) =>
        toast(
          err === 'DENIED'
            ? '주소창 왼쪽 자물쇠 아이콘에서 위치를 ‘허용’으로 바꿔 주세요'
            : '지금 위치를 찾지 못했어요',
        ),
    );
  };

  const doLogout = async () => {
    setBusy(true);
    try {
      // 서버가 로그인 유지 쿠키를 지워야 새로 고침해도 다시 로그인되지 않는다
      await logout();
      signOut(); // 라우트 가드가 로그인 화면으로 보낸다
    } catch (err) {
      toast(`로그아웃하지 못했어요. ${errorMessage(err)}`);
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="설정" />
      <div className={styles.content}>
        <MenuSection title="위치">
          <MenuList
            items={[
              { label: '위치 권한', value: PERMISSION_LABEL[permission], onClick: askLocation },
              { label: '내 동네', value: regionText, to: '/me/regions' },
            ]}
          />
        </MenuSection>

        <MenuSection title="계정">
          <MenuList
            items={[
              {
                label: '연결된 계정',
                value: methods.map((m) => LOGIN_METHOD_LABEL[m]).join(' · '),
              },
              ...(hasPassword ? [{ label: '비밀번호 변경', to: '/me/password' }] : []),
              { label: '로그아웃', onClick: () => setLogoutOpen(true) },
              { label: '회원 탈퇴', to: '/me/withdraw', muted: true },
            ]}
          />
        </MenuSection>

        <MenuSection title="정보">
          <MenuList
            items={[
              { label: '공지사항', to: '/notices' },
              { label: '이용약관 · 개인정보 처리방침', to: '/terms' },
              { label: '앱 버전', value: APP_VERSION },
            ]}
          />
        </MenuSection>
      </div>

      <Dialog
        open={logoutOpen}
        title="로그아웃할까요?"
        description={['이 기기에서만 로그아웃돼요.']}
        confirmLabel="로그아웃"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={doLogout}
        busy={busy}
      />
    </Screen>
  );
}
