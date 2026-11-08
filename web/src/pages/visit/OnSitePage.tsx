import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  getMapRestaurants,
  getRestaurant,
  type MapRestaurant,
  type RestaurantDetail,
} from '../../api/restaurants';
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
import { boundsAround, metersBetween } from '../../lib/geo';
import { type Coords, getPreciseCoords } from '../../lib/geolocation';
import { useAsync } from '../../lib/useAsync';
import styles from './Visit.module.css';

/** 홈에서 바로 왔을 때 가게를 찾는 반경 (m). 현장인증 범위(서버 ALLOWED_DISTANCE_M)와 같다 */
const NEARBY_RADIUS_M = 100;
/** 가까운 순으로 이만큼만 보여 준다 */
const NEARBY_MAX_ITEMS = 20;
/** 근처 가게 고르기에서 잰 위치를 잰 뒤 이 시간(ms) 안에만 위치 확인에 그대로 쓴다 */
const PASSED_COORDS_MAX_AGE_MS = 60_000;

type PreciseCoords = Coords & { accuracyM: number };
/** 근처 가게 고르기 → 현장인증으로 넘기는 위치 (라우터 state) */
type PassedCoords = { me: PreciseCoords; at: number };
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

/**
 * 현장인증 /visits/new/on-site?restaurantId= — 정복 미션 1 위치 확인(VISIT-01) → 2 음식 사진(VISIT-02).
 * 가게 없이(홈에서 바로) 오면 먼저 내 위치 근처 가게를 고른다
 */
export function OnSitePage() {
  const restaurantId = Number(useSearchParams()[0].get('restaurantId'));
  if (!Number.isInteger(restaurantId) || restaurantId <= 0) return <PickNearby />;
  return <OnSiteLoader restaurantId={restaurantId} />;
}

/** 정복 미션 n / 2 머리말 */
function Mission({ no, text }: { no: 1 | 2; text: string }) {
  return (
    <>
      <p className={styles.mission}>정복 미션 {no} / 2</p>
      <p className={styles.missionText}>{text}</p>
      <div className={styles.progress} aria-hidden="true">
        <span data-done="true" />
        <span data-done={no === 2} />
      </div>
    </>
  );
}

type NearbyItem = MapRestaurant & { distanceM: number };
type PickStep =
  | { kind: 'start' }
  | { kind: 'checking' }
  | { kind: 'denied' }
  | { kind: 'list'; me: PreciseCoords; measuredAt: number; items: NearbyItem[] };

/** 홈에서 바로 현장인증: 내 위치 100m 안 가게를 가까운 순으로 보여 주고, 고르면 그 위치로 바로 확인한다 */
function PickNearby() {
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<PickStep>({ kind: 'start' });
  const [pickedId, setPickedId] = useState<number | null>(null);
  // 화면을 떠나면 진행 중인 찾기를 멈추고 결과·오류 안내를 버린다
  const findRequest = useRef<AbortController>(undefined);
  useEffect(() => () => findRequest.current?.abort(), []);

  const find = async () => {
    findRequest.current?.abort();
    const controller = new AbortController();
    findRequest.current = controller;
    setStep({ kind: 'checking' });
    try {
      const me = await getPreciseCoords();
      const measuredAt = Date.now();
      if (controller.signal.aborted) return;
      // 서버가 가운데(내 위치)에서 가까운 순으로 준다
      const { items } = await getMapRestaurants(
        boundsAround(me, NEARBY_RADIUS_M),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const near = items
        .map((r) => ({ ...r, distanceM: Math.round(metersBetween(me, r)) }))
        .filter((r) => r.distanceM <= NEARBY_RADIUS_M)
        .slice(0, NEARBY_MAX_ITEMS);
      setPickedId(near[0]?.restaurantId ?? null);
      setStep({ kind: 'list', me, measuredAt, items: near });
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err === 'DENIED') return setStep({ kind: 'denied' });
      toast(
        err === 'UNAVAILABLE'
          ? '지금 위치를 찾지 못했어요. 잠시 후 다시 시도해 주세요'
          : errorMessage(err),
      );
      setStep({ kind: 'start' });
    }
  };

  if (step.kind !== 'list') {
    return (
      <Screen
        footer={
          <Button onClick={() => find()} disabled={step.kind === 'checking'}>
            {step.kind === 'checking'
              ? '근처 가게를 찾는 중…'
              : step.kind === 'denied'
                ? '다시 시도하기'
                : '위치 권한 허용하기'}
          </Button>
        }
      >
        <AppHeader title="현장인증" />
        <div className={styles.content}>
          <Mission no={1} text="먼저 현재 위치를 확인할게요" />
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
              <p className={styles.statusTitle}>지금 있는 가게를 찾아요</p>
              <p className={styles.statusText}>
                내 위치 {NEARBY_RADIUS_M}m 안의 가게를 보여 드릴게요. 위치 접근을 허용해주세요.
              </p>
              <p className={styles.statusText}>· 매장과의 거리 확인</p>
              <p className={styles.statusText}>· 현장인증 중에만 위치 사용</p>
            </div>
          )}
          <p className={styles.caption}>위치 정보는 방문 확인 용도로만 사용돼요.</p>
        </div>
      </Screen>
    );
  }

  const picked = step.items.find((r) => r.restaurantId === pickedId) ?? null;
  const go = () => {
    if (!picked) return;
    // 고른 때가 아니라 잰 때를 넘겨, 목록을 오래 보고 있었으면 현장인증에서 다시 잰다
    const passed: PassedCoords = { me: step.me, at: step.measuredAt };
    navigate(`/visits/new/on-site?restaurantId=${picked.restaurantId}`, { state: passed });
  };
  return (
    <Screen
      footer={
        step.items.length > 0 ? (
          <Button onClick={go} disabled={!picked}>
            {picked ? `${picked.name}에서 인증하기` : '가게를 골라 주세요'}
          </Button>
        ) : (
          <Button onClick={() => find()}>다시 찾기</Button>
        )
      }
    >
      <AppHeader title="현장인증" />
      <div className={styles.content}>
        <Mission no={1} text="지금 있는 가게를 골라 주세요" />
        {step.items.length > 0 ? (
          <div role="radiogroup" aria-label="지금 있는 가게" className={styles.candidates}>
            <p className={styles.sectionTitle}>내 위치 {NEARBY_RADIUS_M}m 안의 가게</p>
            {step.items.map((c) => (
              <button
                key={c.restaurantId}
                type="button"
                role="radio"
                aria-checked={c.restaurantId === pickedId}
                className={styles.candidate}
                onClick={() => setPickedId(c.restaurantId)}
              >
                <span className={styles.candidateName}>{c.name}</span>
                <span className={styles.candidateMeta}>
                  {joinDot([c.categoryName, formatDistance(c.distanceM)])}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.status}>
            <p className={styles.statusTitle} data-tone="warn">
              {NEARBY_RADIUS_M}m 안에서 가게를 찾지 못했어요
            </p>
            <p className={styles.statusText}>
              매장 안이라면 잠시 뒤 다시 찾거나, 검색해서 가게를 골라 주세요.
            </p>
          </div>
        )}
        <Link to="/search" className={styles.searchLink}>
          <span>검색해서 직접 찾기</span>
          <span aria-hidden="true">›</span>
        </Link>
      </div>
    </Screen>
  );
}

function OnSiteLoader({ restaurantId }: { restaurantId: number }) {
  const { data: r, error, reload } = useAsync(() => getRestaurant(restaurantId), [restaurantId]);
  const passed = toPassedCoords(useLocation().state);

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
  return <OnSite r={r} passed={passed} />;
}

/** 라우터 state는 타입이 보장되지 않으니 좌표·시각이 숫자일 때만 쓴다 */
function toPassedCoords(state: unknown): PassedCoords | null {
  const s = state as Partial<PassedCoords> | null;
  const me = s?.me;
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!me || !num(me.lat) || !num(me.lng) || !num(me.accuracyM) || !num(s?.at)) return null;
  return { me, at: s.at };
}

function OnSite({ r, passed }: { r: RestaurantDetail; passed: PassedCoords | null }) {
  const navigate = useNavigate();
  const toast = useToast();
  // 근처 가게 고르기에서 막 잰 위치. 오래됐으면(새로고침 등) 쓰지 않고 처음부터 잰다
  const [autoCoords] = useState(() =>
    passed && Date.now() - passed.at < PASSED_COORDS_MAX_AGE_MS ? passed.me : null,
  );
  const [step, setStep] = useState<Step>({ kind: autoCoords ? 'checking' : 'start' });
  const [busy, setBusy] = useState(false);
  const photoUrl = 'photo' in step ? step.photo.url : null;
  useEffect(
    () => () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    },
    [photoUrl],
  );

  /** 위치 확인 (VISIT-01). known은 근처 가게 고르기에서 막 잰 위치 */
  const check = async (known?: PreciseCoords) => {
    setStep({ kind: 'checking' });
    try {
      const me = known ?? (await getPreciseCoords());
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

  // 근처 가게 고르기에서 왔으면 그때 잰 위치로 바로 확인한다 (StrictMode에서 두 번 부르지 않게 한 번만)
  const autoChecked = useRef(false);
  useEffect(() => {
    if (!autoCoords || autoChecked.current) return;
    autoChecked.current = true;
    void check(autoCoords);
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const mission = (no: 1 | 2, text: string) => <Mission no={no} text={text} />;

  switch (step.kind) {
    case 'start':
    case 'checking':
    case 'denied':
      return (
        <Screen
          footer={
            <Button onClick={() => check()} disabled={step.kind === 'checking'}>
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
        <Screen footer={<Button onClick={() => check()}>매장 위치 다시 확인</Button>}>
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
