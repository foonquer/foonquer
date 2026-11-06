import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { getRestaurant, type RestaurantDetail } from '../../api/restaurants';
import { IMAGE_ACCEPT, uploadImage } from '../../api/uploads';
import { checkLocation, completeOnSite } from '../../api/visits';
import mealThumb from '../../assets/illust/meal-thumb.svg';
import { AppHeader } from '../../components/AppHeader';
import { Button, ButtonLink } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { readPhotoMeta, type PhotoMeta } from '../../lib/exif';
import { formatDistance, joinDot } from '../../lib/format';
import { type Coords, getPreciseCoords } from '../../lib/geolocation';
import { useAsync } from '../../lib/useAsync';
import styles from './Visit.module.css';

type Check = { verificationId: number; distanceM: number; allowedM: number; me: Coords };
type Photo = { file: File; url: string };

type Step =
  | { kind: 'start' }
  | { kind: 'checking' }
  | { kind: 'near'; check: Check }
  | { kind: 'far'; distanceM: number; allowedM: number }
  | { kind: 'denied' }
  | { kind: 'blocked'; message: string; pendingVisitId?: number }
  | { kind: 'photo'; check: Check; unclear?: boolean }
  | { kind: 'confirm'; check: Check; photo: Photo }
  | { kind: 'ready'; check: Check; photo: Photo; key: string; meta: PhotoMeta };

/** 현장인증 /visits/new/on-site?restaurantId= — 정복 미션 1 위치 확인(VISIT-01) → 2 음식 사진(VISIT-02) */
export function OnSitePage() {
  const restaurantId = Number(useSearchParams()[0].get('restaurantId'));
  const { data: r, error, reload } = useAsync(() => getRestaurant(restaurantId), [restaurantId]);

  if (error) {
    return (
      <Screen>
        <AppHeader title="현장인증" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!r) {
    return (
      <Screen>
        <AppHeader title="현장인증" />
        <Loading />
      </Screen>
    );
  }
  return <OnSite r={r} />;
}

function OnSite({ r }: { r: RestaurantDetail }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<Step>({ kind: 'start' });
  const [busy, setBusy] = useState(false);
  const photoUrl = 'photo' in step ? step.photo.url : null;
  useEffect(
    () => () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    },
    [photoUrl],
  );

  const check = async () => {
    setStep({ kind: 'checking' });
    try {
      const me = await getPreciseCoords();
      const result = await checkLocation({
        restaurantId: r.restaurantId,
        lat: me.lat,
        lng: me.lng,
        accuracyM: me.accuracyM,
      });
      setStep({ kind: 'near', check: { ...result, me } });
    } catch (err) {
      if (err === 'DENIED') return setStep({ kind: 'denied' });
      if (err === 'UNAVAILABLE') {
        toast('지금 위치를 찾지 못했어요. 잠시 후 다시 시도해 주세요');
        return setStep({ kind: 'start' });
      }
      if (err instanceof ApiError && err.code === 'VISIT_TOO_FAR') {
        const data = err.data as { distanceM: number; allowedM: number };
        return setStep({ kind: 'far', ...data });
      }
      const pendingVisitId =
        err instanceof ApiError && err.code === 'VISIT_PENDING_RATING'
          ? (err.data as { verificationId: number } | null)?.verificationId
          : undefined;
      setStep({ kind: 'blocked', message: errorMessage(err), pendingVisitId });
    }
  };

  const pickPhoto = (c: Check, files: FileList | null) => {
    const file = files?.[0];
    if (file)
      setStep({ kind: 'confirm', check: c, photo: { file, url: URL.createObjectURL(file) } });
  };

  const confirmPhoto = async (c: Check, photo: Photo) => {
    setBusy(true);
    try {
      const [key, meta] = await Promise.all([
        uploadImage(photo.file, 'SITE_PHOTO'),
        readPhotoMeta(photo.file),
      ]);
      setStep({ kind: 'ready', check: c, photo, key, meta });
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const conquer = async (s: Extract<Step, { kind: 'ready' }>) => {
    setBusy(true);
    try {
      const result = await completeOnSite(s.check.verificationId, {
        sitePhotoKey: s.key,
        photoTakenAt: s.meta.takenAt,
        photoLat: s.meta.lat,
        photoLng: s.meta.lng,
      });
      if (result.reward.point > 0)
        toast({ message: `방문 인증 +${result.reward.point}P`, check: true });
      navigate(`/visits/${result.verificationId}/follow`, { replace: true });
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.code === 'PHOTO_MISMATCH') {
        return setStep({ kind: 'photo', check: s.check, unclear: true });
      }
      toast(errorMessage(err));
      if (err instanceof ApiError && err.code === 'LOCATION_CHECK_EXPIRED')
        setStep({ kind: 'start' });
    }
  };

  const shopMeta = (distanceM?: number) =>
    joinDot([
      r.categoryName,
      r.dongName,
      distanceM !== undefined ? `현재 위치 ${formatDistance(distanceM)}` : null,
    ]);
  const shop = (distanceM?: number) => (
    <div className={styles.shop}>
      <span className={styles.shopIcon} aria-hidden="true">
        <img src={mealThumb} alt="" width={40} height={40} />
      </span>
      <div>
        <p className={styles.shopName}>{r.name}</p>
        <p className={styles.shopMeta}>{shopMeta(distanceM)}</p>
      </div>
    </div>
  );
  const mission = (no: 1 | 2, text: string) => (
    <>
      <p className={styles.mission}>정복 미션 {no} / 2</p>
      <p className={styles.missionText}>{text}</p>
      <div className={styles.progress} aria-hidden="true">
        <span data-done="true" />
        <span data-done={no === 2} />
      </div>
    </>
  );

  switch (step.kind) {
    case 'start':
    case 'checking':
    case 'denied':
      return (
        <Screen
          footer={
            <Button onClick={check} disabled={step.kind === 'checking'}>
              {step.kind === 'checking'
                ? '위치를 확인하는 중…'
                : step.kind === 'denied'
                  ? '다시 시도하기'
                  : '위치 권한 허용하기'}
            </Button>
          }
        >
          <AppHeader title="현장인증" />
          <div className={styles.content}>
            {mission(1, '먼저 현재 위치를 확인할게요')}
            {step.kind === 'denied' ? (
              <div className={styles.status}>
                <p className={styles.statusTitle} data-tone="warn">
                  위치 권한이 꺼져 있어요
                </p>
                <p className={styles.statusText}>
                  주소창 왼쪽의 자물쇠 아이콘을 눌러 위치를 ‘허용’으로 바꾼 뒤 다시 시도해 주세요.
                </p>
              </div>
            ) : (
              <div className={styles.status}>
                <p className={styles.statusTitle}>매장에 있는지 확인해요</p>
                <p className={styles.statusText}>
                  {r.name} 근처에 있는지 확인할 수 있도록 위치 접근을 허용해주세요.
                </p>
                <p className={styles.statusText}>· 매장과의 거리 확인</p>
                <p className={styles.statusText}>· 현장인증 중에만 위치 사용</p>
              </div>
            )}
            <p className={styles.caption}>위치 정보는 방문 확인 용도로만 사용돼요.</p>
          </div>
        </Screen>
      );
    case 'near':
      return (
        <Screen
          footer={
            <Button onClick={() => setStep({ kind: 'photo', check: step.check })}>
              위치 확인하고 다음으로
            </Button>
          }
        >
          <AppHeader title="현장인증" />
          <div className={styles.content}>
            {mission(1, `${r.name} 근처인지 확인해요`)}
            {shop(step.check.distanceM)}
            <NearMap r={r} me={step.check.me} allowedM={step.check.allowedM} />
            <div className={styles.status}>
              <p className={styles.statusTitle} data-tone="ok">
                매장 위치 확인 완료
              </p>
              <p className={styles.statusText}>
                매장에서 {formatDistance(step.check.distanceM)} · 인증 범위{' '}
                {formatDistance(step.check.allowedM)} 이내
              </p>
            </div>
          </div>
        </Screen>
      );
    case 'far':
      return (
        <Screen footer={<Button onClick={check}>매장 위치 다시 확인</Button>}>
          <AppHeader title="현장인증" />
          <div className={styles.content}>
            {mission(1, `${r.name} 근처인지 확인해요`)}
            {shop(step.distanceM)}
            <div className={styles.status}>
              <p className={styles.statusTitle} data-tone="warn">
                아직 매장 근처가 아니에요
              </p>
              <p className={styles.statusText}>
                현재 {formatDistance(step.distanceM)} · 매장 {formatDistance(step.allowedM)}{' '}
                이내에서 확인 가능
              </p>
              <p className={styles.statusText}>매장에 가까워지면 다시 확인해주세요.</p>
            </div>
          </div>
        </Screen>
      );
    case 'blocked':
      return (
        <Screen
          footer={
            step.pendingVisitId ? (
              <ButtonLink to={`/visits/${step.pendingVisitId}/rating`}>별점 남기러 가기</ButtonLink>
            ) : (
              <ButtonLink to={`/restaurants/${r.restaurantId}`} variant="white">
                가게로 돌아가기
              </ButtonLink>
            )
          }
        >
          <AppHeader title="현장인증" />
          <EmptyState title="지금은 인증할 수 없어요" description={step.message} />
        </Screen>
      );
    case 'photo':
      return (
        <Screen>
          <AppHeader title={step.unclear ? '사진 다시 선택' : '음식 사진 선택'} />
          <div className={styles.content}>
            {mission(
              2,
              step.unclear
                ? '사진을 확인하기 어려워요'
                : '갤러리에서 음식이나 식사 장면 사진을 골라주세요',
            )}
            {step.unclear && (
              <div className={styles.status}>
                <p className={styles.statusTitle} data-tone="warn">
                  음식이 선명하게 보이지 않아요
                </p>
                <p className={styles.statusText}>
                  이 가게에서 찍은, 음식이나 식사 장면이 잘 보이는 사진을 갤러리에서 다시
                  골라주세요.
                </p>
              </div>
            )}
            <label className={styles.picker}>
              <span aria-hidden="true">＋</span>
              <span>탭해서 갤러리에서 사진을 골라주세요</span>
              <input
                type="file"
                accept={IMAGE_ACCEPT}
                hidden
                onChange={(e) => pickPhoto(step.check, e.target.files)}
              />
            </label>
            <p className={styles.caption}>사진에 담긴 위치와 촬영 시간으로 방문을 확인해요.</p>
          </div>
        </Screen>
      );
    case 'confirm':
      return (
        <Screen
          footer={
            <div className={styles.captureButtons}>
              <Button
                variant="white"
                onClick={() => setStep({ kind: 'photo', check: step.check })}
                disabled={busy}
              >
                다시 고르기
              </Button>
              <Button onClick={() => confirmPhoto(step.check, step.photo)} disabled={busy}>
                {busy ? '사진을 올리는 중…' : '이 사진 사용하기'}
              </Button>
            </div>
          }
        >
          <AppHeader title="사진 확인" />
          <div className={styles.content}>
            {mission(2, '고른 사진을 확인해주세요')}
            <img src={step.photo.url} alt="고른 음식 사진" className={styles.preview} />
            <div className={styles.status}>
              <p className={styles.statusTitle}>음식 사진이 잘 보이나요?</p>
              <p className={styles.statusText}>음식 또는 식사 장면이 보여야 해요.</p>
            </div>
          </div>
        </Screen>
      );
    case 'ready':
      return (
        <Screen
          footer={
            <>
              <p className={styles.caption}>위치와 사진 정보는 방문 확인 용도로만 사용돼요.</p>
              <Button onClick={() => conquer(step)} disabled={busy}>
                {r.name} 정복하기
              </Button>
            </>
          }
        >
          <AppHeader title="현장인증" />
          <div className={styles.content}>
            {shop(step.check.distanceM)}
            <div>
              <p className={styles.sectionTitle}>{r.name} 정복 미션</p>
              <p className={styles.caption} style={{ textAlign: 'left' }}>
                아래 2가지만 확인하면 정복할 수 있어요
              </p>
            </div>
            <ol className={styles.steps}>
              <li>
                <span className={styles.stepNo}>1</span>
                <div>
                  <p className={styles.stepTitle}>매장 위치 확인</p>
                  <p className={styles.stepText}>
                    현재 {r.name}에서 {formatDistance(step.check.distanceM)} · 위치 확인 완료
                  </p>
                </div>
              </li>
              <li>
                <span className={styles.stepNo}>2</span>
                <div>
                  <p className={styles.stepTitle}>음식 사진 선택</p>
                  <p className={styles.stepText}>갤러리에서 고른 음식 사진을 확인했어요</p>
                </div>
              </li>
            </ol>
            <p className={styles.ready}>
              <span>정복 준비 완료!</span>
              <span>2 / 2 완료</span>
            </p>
          </div>
        </Screen>
      );
  }
}

/** 매장 반경(인증 범위) 안의 내 위치 그림. 반경 원 지름 120px = allowedM × 2 */
function NearMap({ r, me, allowedM }: { r: RestaurantDetail; me: Coords; allowedM: number }) {
  const scale = 60 / allowedM;
  const dx = (me.lng - r.lng) * 111_320 * Math.cos((r.lat * Math.PI) / 180) * scale;
  const dy = (r.lat - me.lat) * 110_540 * scale;
  const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));
  return (
    <div className={styles.map} aria-hidden="true">
      <span className={styles.radius} />
      <span className={styles.shopPin}>{r.name}</span>
      <span
        className={styles.me}
        style={{ left: `calc(50% + ${clamp(dx, 140)}px)`, top: `calc(50% + ${clamp(dy, 80)}px)` }}
      >
        내 위치
      </span>
    </div>
  );
}
