import { useEffect, useState } from 'react';
import { logout } from '../../api/auth';
import {
  getMe,
  getSettings,
  getTasteWeights,
  type NotificationSettings,
  type PersonalizationSettings,
  type TasteWeights,
  updateNotificationSettings,
} from '../../api/users';
import { AppHeader } from '../../components/AppHeader';
import { Dialog } from '../../components/Dialog';
import { MenuList, MenuSection } from '../../components/MenuList';
import { Screen } from '../../components/Screen';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { getCurrentCoords } from '../../lib/geolocation';
import { signOut } from '../../lib/session';
import { weightBrief } from '../../lib/taste';
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
    // 조회가 끝나기 전에 화면을 떠났으면 리스너를 붙이지 않는다
    let alive = true;
    const update = () => status && setState(status.state as LocationPermission);
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((s) => {
        if (!alive) return;
        status = s;
        update();
        s.addEventListener('change', update);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      status?.removeEventListener('change', update);
    };
  }, []);
  return [state, setState] as const;
}

/** 설정 /me/settings: 내 취향·알림(SET-01·02)·위치 권한·내 동네·연결된 계정(카카오)·로그아웃(AUTH-11) */
export function SettingsPage() {
  const toast = useToast();
  const me = useAsync(getMe, []);
  const taste = useAsync(getTasteWeights, []);
  const settings = useAsync(getSettings, []);
  const notification = settings.data?.notification;

  type AlarmKey = 'conquestAlarm' | 'rankAlarm' | 'marketingAlarm';
  type PersonalKey = keyof PersonalizationSettings;
  // 저장 중인 스위치는 잠근다 (연달아 누르면 요청 순서가 엇갈려 화면과 서버 값이 달라질 수 있다)
  const [saving, setSaving] = useState<Set<AlarmKey | PersonalKey>>(new Set());
  const toggle = async (key: AlarmKey | PersonalKey, value: boolean) => {
    // 먼저 바꿔 보여 주고, 실패하면 되돌린다
    const set = (v: boolean) =>
      settings.mutate((prev) =>
        key === 'questEnabled' || key === 'personalizedReco'
          ? { ...prev, personalization: { ...prev.personalization, [key]: v } }
          : { ...prev, notification: { ...prev.notification, [key]: v } },
      );
    set(value);
    setSaving((s) => new Set(s).add(key));
    try {
      const { message } = await updateNotificationSettings({ [key]: value });
      toast(message);
    } catch (err) {
      set(!value);
      toast(errorMessage(err));
    } finally {
      setSaving((s) => new Set([...s].filter((k) => k !== key)));
    }
  };
  const alarm = (key: AlarmKey, label: string) => ({
    label,
    value: notification ? (
      <Switch
        label={label}
        checked={(notification as NotificationSettings)[key]}
        onChange={(v) => toggle(key, v)}
        disabled={saving.has(key)}
      />
    ) : undefined,
  });
  const personalization = settings.data?.personalization;
  const personal = (key: PersonalKey, label: string) => ({
    label,
    value: personalization ? (
      <Switch
        label={label}
        checked={personalization[key]}
        onChange={(v) => toggle(key, v)}
        disabled={saving.has(key)}
      />
    ) : undefined,
  });
  const [permission, setPermission] = useLocationPermission();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const regions = me.data?.localRegions ?? [];
  const regionText = regions[0]
    ? `${regions[0].sigunguName} ${regions[0].dongName}${regions.length > 1 ? ` 외 ${regions.length - 1}곳` : ''}`
    : '';

  // 화면에 보이는 권한은 오래된 값일 수 있어(변경을 지켜보지 못하는 브라우저) 누를 때마다 다시 확인한다
  const askLocation = () => {
    const wasGranted = permission === 'granted';
    getCurrentCoords().then(
      () => {
        setPermission('granted');
        toast(wasGranted ? '위치 권한이 켜져 있어요' : '위치 권한을 켰어요');
      },
      (err: unknown) => {
        if (err === 'DENIED') setPermission('denied');
        toast(
          err === 'DENIED'
            ? '주소창 왼쪽 자물쇠 아이콘에서 위치를 ‘허용’으로 바꿔 주세요'
            : '지금 위치를 찾지 못했어요',
        );
      },
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
        <MenuSection title="추천 · 별점">
          <MenuList
            items={[
              {
                label: (
                  <>
                    내 취향 설정
                    <span className={styles.sub}>내 종합 별점 계산에 쓰여요</span>
                  </>
                ),
                value: taste.data
                  ? weightBrief(
                      Object.fromEntries(
                        taste.data.items.map((i) => [i.key, i.level]),
                      ) as TasteWeights,
                    )
                  : '',
                to: '/me/taste',
              },
            ]}
          />
        </MenuSection>

        <MenuSection title="맞춤 퀘스트">
          <MenuList
            items={
              settings.error
                ? [
                    {
                      label: '설정을 불러오지 못했어요',
                      value: '다시 시도',
                      onClick: settings.reload,
                    },
                  ]
                : [
                    personal('questEnabled', '맞춤 퀘스트'),
                    personal('personalizedReco', '방문 기록으로 맞춤 추천'),
                  ]
            }
          />
          <p className={styles.note}>
            방문 기록으로 맞춤 추천을 끄면 퀘스트가 동네 일반 추천으로 바뀌어요. 기록은 다른
            사람에게 보이지 않아요.
          </p>
        </MenuSection>

        <MenuSection title="알림">
          <MenuList
            items={
              settings.error
                ? [
                    {
                      label: '알림 설정을 불러오지 못했어요',
                      value: '다시 시도',
                      onClick: settings.reload,
                    },
                  ]
                : [
                    alarm('conquestAlarm', '정복·리뷰 알림'),
                    alarm('rankAlarm', '먹짱·순위 변동 알림'),
                    alarm('marketingAlarm', '이벤트·혜택 알림'),
                  ]
            }
          />
        </MenuSection>

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
              // 로그인은 카카오 하나만 쓴다
              { label: '연결된 계정', value: '카카오' },
              { label: '로그아웃', onClick: () => setLogoutOpen(true) },
              { label: '회원 탈퇴', to: '/me/withdraw', muted: true },
            ]}
          />
        </MenuSection>

        <MenuSection title="정보">
          <MenuList
            items={[
              { label: '공지사항', to: '/notices' },
              { label: '이용약관 · 개인정보 처리방침', to: '/terms?type=TERMS' },
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
