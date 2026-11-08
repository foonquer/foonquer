import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { getHomeSummary } from '../../api/home';
import { getMapRestaurants, type Bounds, type MapRestaurant } from '../../api/restaurants';
import { getMe } from '../../api/users';
import bellIcon from '../../assets/icons/bell.svg';
import flagIcon from '../../assets/icons/flag.svg';
import gearIcon from '../../assets/icons/gear.svg';
import searchIcon from '../../assets/icons/search.svg';
import { MapView } from '../../components/MapView';
import { MukkaebiAvatar } from '../../components/Mukkaebi';
import { RegionChip } from '../../components/RegionChip';
import { RegionSelectSheet } from '../../components/RegionSelectSheet';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { SEOUL_CENTER, useViewRegion } from '../../lib/region';
import { useAsync } from '../../lib/useAsync';
import { useMyCoords } from '../../lib/useMyCoords';
import { NearbySheet } from './NearbySheet';
import { PreviewSheet } from './PreviewSheet';
import styles from './HomePage.module.css';

/** 지도를 멈추고 이만큼 기다렸다가 가게를 다시 불러온다 (ms) */
const FETCH_DELAY_MS = 300;
/** 지도를 누른 자리에서 가게를 찾는 반경 (m). 카카오 지도의 가게 이름 위치와 공공데이터 좌표가 조금씩 다르다 */
const TAP_RADIUS_M = 30;
/** 여러 곳이면 가까운 순으로 이만큼만 보여 준다 */
const TAP_MAX_ITEMS = 10;

/** 한 점 둘레 radiusM 정사각형 영역 (위도 1도 ≈ 111km, 경도는 위도에 따라 줄어든다) */
function boundsAround({ lat, lng }: { lat: number; lng: number }, radiusM: number): Bounds {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { swLat: lat - dLat, swLng: lng - dLng, neLat: lat + dLat, neLng: lng + dLng };
}

/** 홈: 프로필 줄(HOME-01) + 음식점 검색 + 지도(MAP-01) + 가게 미리보기(MAP-02). 지도의 빈 곳을 누르면 그 자리 가게를 찾는다 */
export function HomePage() {
  const toast = useToast();
  const me = useAsync(getMe, []);
  // 레벨·칭호 — 못 받아도 홈은 그대로 쓴다
  const summary = useAsync(getHomeSummary, []);
  const title = summary.data ? (summary.data.title ?? summary.data.rank.main?.tierTitle) : null;
  const { region, error: regionError, retry } = useViewRegion();
  const { coords } = useMyCoords();
  const [pins, setPins] = useState<MapRestaurant[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [nearby, setNearby] = useState<MapRestaurant[] | null>(null);
  const [regionOpen, setRegionOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const request = useRef<AbortController>(undefined);
  const tapRequest = useRef<AbortController>(undefined);

  const loadPins = useCallback(
    (bounds: Bounds) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        try {
          // 홈 지도는 내가 찜한 곳·정복한 곳만 (다른 가게는 검색으로 찾는다)
          const result = await getMapRestaurants({ ...bounds, mineOnly: true }, controller.signal);
          setPins(result.items);
          setNotice(
            result.truncated
              ? '가게가 많아 일부만 보여요. 지도를 확대해 보세요'
              : result.items.length === 0
                ? '찜하거나 정복한 가게가 지도에 표시돼요'
                : null,
          );
        } catch (err) {
          if (controller.signal.aborted) return;
          if (err instanceof ApiError && err.code === 'MAP_BOUNDS_TOO_LARGE') {
            setPins([]);
            setNotice('지도를 더 확대해 주세요');
          } else {
            toast(errorMessage(err));
          }
        }
      }, FETCH_DELAY_MS);
    },
    [toast],
  );

  // 핀이 아닌 곳을 누르면 그 자리 가게(찜·정복 여부와 상관없이)를 찾아 미리보기, 여러 곳이면 고르기
  const findAt = useCallback(
    async (point: { lat: number; lng: number }) => {
      tapRequest.current?.abort();
      const controller = new AbortController();
      tapRequest.current = controller;
      try {
        const { items } = await getMapRestaurants(
          boundsAround(point, TAP_RADIUS_M),
          controller.signal,
        );
        if (items.length === 0) toast('이 자리에서 가게를 찾지 못했어요');
        else if (items.length === 1) setSelectedId(items[0].restaurantId);
        else setNearby(items.slice(0, TAP_MAX_ITEMS));
      } catch (err) {
        if (!controller.signal.aborted) toast(errorMessage(err));
      }
    },
    [toast],
  );

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      request.current?.abort();
      tapRequest.current?.abort();
    },
    [],
  );

  const closePreview = useCallback(() => setSelectedId(null), []);
  const closeNearby = useCallback(() => setNearby(null), []);
  const pickNearby = useCallback((restaurantId: number) => {
    setNearby(null);
    setSelectedId(restaurantId);
  }, []);
  const center = region?.lat && region.lng ? { lat: region.lat, lng: region.lng } : SEOUL_CENTER;

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div className={styles.profileRow}>
          <MukkaebiAvatar size={54} />
          <div className={styles.profileText}>
            {summary.data && <span className={styles.level}>LV.{summary.data.mukkaebi.level}</span>}
            <p className={styles.nameRow}>
              <span className={styles.nickname}>{me.data?.nickname ?? ''}</span>
              {title && <span className={styles.title}>{title}</span>}
            </p>
          </div>
          <Link to="/notifications" className={styles.iconButton} aria-label="알림">
            <img src={bellIcon} alt="" width={24} height={24} />
          </Link>
          <Link to="/me/settings" className={styles.iconButton} aria-label="설정">
            <img src={gearIcon} alt="" width={24} height={23} />
          </Link>
        </div>
        <Link to="/search" className={styles.search}>
          <img src={searchIcon} alt="" width={16} height={16} />
          음식점 검색
        </Link>
      </header>

      <section className={styles.mapArea} aria-label="동네 지도">
        {region ? (
          <MapView
            center={center}
            pins={pins}
            selectedId={selectedId}
            onPinClick={setSelectedId}
            onMapClick={findAt}
            onBoundsChange={loadPins}
          />
        ) : regionError ? (
          <EmptyState title="내 동네를 불러오지 못했어요" onRetry={retry} />
        ) : (
          <Loading label="지도를 준비하는 중" />
        )}

        <div className={styles.overlayTop}>
          <RegionChip region={region} variant="map" onClick={() => setRegionOpen(true)} />
          <p className={styles.legend}>
            <span className={styles.legendConquered}>● 정복 완료</span>
            <span className={styles.legendUnconquered}>● 미정복</span>
          </p>
        </div>
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}

        <Link to="/visits/new" className={styles.fab}>
          <span className={styles.fabCircle}>
            <img src={flagIcon} alt="" width={28} height={28} />
          </span>
          <span className={styles.fabLabel}>정복하기</span>
        </Link>
      </section>

      <NearbySheet items={nearby} onPick={pickNearby} onClose={closeNearby} />
      <PreviewSheet restaurantId={selectedId} coords={coords} onClose={closePreview} />
      <RegionSelectSheet open={regionOpen} onClose={() => setRegionOpen(false)} />
    </div>
  );
}
