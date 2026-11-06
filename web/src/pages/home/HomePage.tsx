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
import { PreviewSheet } from './PreviewSheet';
import styles from './HomePage.module.css';

/** 지도를 멈추고 이만큼 기다렸다가 가게를 다시 불러온다 (ms) */
const FETCH_DELAY_MS = 300;

/** 홈: 프로필 줄(HOME-01) + 음식점 검색 + 지도(MAP-01) + 가게 미리보기(MAP-02) */
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
  const [regionOpen, setRegionOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const request = useRef<AbortController>(undefined);

  const loadPins = useCallback(
    (bounds: Bounds) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        try {
          const result = await getMapRestaurants(bounds, controller.signal);
          setPins(result.items);
          setNotice(result.truncated ? '가게가 많아 일부만 보여요. 지도를 확대해 보세요' : null);
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

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      request.current?.abort();
    },
    [],
  );

  const closePreview = useCallback(() => setSelectedId(null), []);
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

      <PreviewSheet restaurantId={selectedId} coords={coords} onClose={closePreview} />
      <RegionSelectSheet open={regionOpen} onClose={() => setRegionOpen(false)} />
    </div>
  );
}
