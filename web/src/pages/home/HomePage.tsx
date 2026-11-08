import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { getHomeSummary } from '../../api/home';
import {
  getMapRestaurants,
  getNearestRestaurant,
  type Bounds,
  type MapRestaurant,
} from '../../api/restaurants';
import { getMe } from '../../api/users';
import bellIcon from '../../assets/icons/bell.svg';
import flagIcon from '../../assets/icons/flag.svg';
import gearIcon from '../../assets/icons/gear.svg';
import locateIcon from '../../assets/icons/locate.svg';
import searchIcon from '../../assets/icons/search.svg';
import { MapView } from '../../components/MapView';
import { MukkaebiAvatar } from '../../components/Mukkaebi';
import { MyLocationMarker } from '../../components/MyLocationMarker';
import { RegionChip } from '../../components/RegionChip';
import { RegionSelectSheet } from '../../components/RegionSelectSheet';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { metersBetween } from '../../lib/geo';
import { eunNeun } from '../../lib/korean';
import type { Coords } from '../../lib/geolocation';
import { SEOUL_CENTER, useViewRegion } from '../../lib/region';
import { useAsync } from '../../lib/useAsync';
import { useMyCoords } from '../../lib/useMyCoords';
import { geolocationGranted, useWatchedCoords } from '../../lib/useWatchedCoords';
import { wearingOf } from '../../lib/wearing';
import { PreviewSheet } from './PreviewSheet';
import styles from './HomePage.module.css';

/** 지도를 멈추고 이만큼 기다렸다가 가게를 다시 불러온다 (ms) */
const FETCH_DELAY_MS = 300;
/** 지도를 누른 자리에서 가게를 찾는 반경 = 보이는 지도 가로의 6% (390px 화면이면 손가락 한 개쯤) */
const TAP_RADIUS_RATIO = 0.06;
/** 반경 범위 (m). 서버 MAP-03은 10~100m를 받는다 */
const TAP_RADIUS_MIN_M = 20;
const TAP_RADIUS_MAX_M = 100;

/** 지금 보이는 지도에 맞춘 누르기 반경 (m). 아직 영역을 모르면 30m */
function tapRadius(bounds: Bounds | undefined) {
  if (!bounds) return 30;
  const lat = (bounds.swLat + bounds.neLat) / 2;
  const widthM = metersBetween({ lat, lng: bounds.swLng }, { lat, lng: bounds.neLng });
  return Math.min(
    TAP_RADIUS_MAX_M,
    Math.max(TAP_RADIUS_MIN_M, Math.round(widthM * TAP_RADIUS_RATIO)),
  );
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
  const [regionOpen, setRegionOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const request = useRef<AbortController>(undefined);
  const tapRequest = useRef<AbortController>(undefined);
  const viewBounds = useRef<Bounds>(undefined);

  // 내 위치 먹깨비: 권한을 이미 허용했으면 바로, 아니면 내 위치 버튼을 누르면 위치를 계속 받는다
  const [watching, setWatching] = useState(false);
  /** 내 위치 버튼을 누르고 첫 위치를 기다리는 중이면 그때 보던 동네 */
  const wantFocus = useRef<{ regionId?: number } | null>(null);
  /** 내 위치 버튼으로 옮긴 곳. 그 뒤 동네를 바꾸면 동네 중심으로 돌아간다 */
  const [focus, setFocus] = useState<{ coords: Coords; regionId?: number; key: number } | null>(
    null,
  );
  const focusOn = useCallback((coords: Coords, regionId?: number) => {
    setFocus((f) => ({ coords, regionId, key: (f?.key ?? 0) + 1 }));
  }, []);
  const live = useWatchedCoords(watching, {
    onFix: (c) => {
      if (!wantFocus.current) return;
      focusOn(c, wantFocus.current.regionId);
      wantFocus.current = null;
    },
    onError: (error) => {
      // 버튼을 눌렀을 때만 알린다 (자동으로 켠 경우는 조용히)
      if (!wantFocus.current) return;
      wantFocus.current = null;
      toast(
        error === 'DENIED'
          ? '위치 권한이 꺼져 있어요. 주소창 왼쪽 자물쇠에서 위치를 허용해 주세요'
          : '지금 위치를 찾지 못했어요. 잠시 후 다시 시도해 주세요',
      );
    },
  });
  useEffect(() => {
    let alive = true;
    void geolocationGranted().then((granted) => alive && granted && setWatching(true));
    return () => {
      alive = false;
    };
  }, []);
  const locate = () => {
    if (!('geolocation' in navigator)) {
      toast('이 브라우저에서는 위치를 쓸 수 없어요');
      return;
    }
    if (live) {
      focusOn(live, region?.regionId);
      return;
    }
    wantFocus.current = { regionId: region?.regionId };
    setWatching(true);
  };

  const loadPins = useCallback(
    (bounds: Bounds) => {
      viewBounds.current = bounds;
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

  // 핀이 아닌 곳을 누르면 그 자리에서 가장 가까운 음식점 1곳(찜·정복 여부와 상관없이)을 미리보기.
  // 카카오 지도에 그려진 가게 이름은 카카오 좌표에 있어서 서버가 카카오 음식점 기준으로 찾는다 (MAP-03)
  const findAt = useCallback(
    async (point: Coords) => {
      tapRequest.current?.abort();
      const controller = new AbortController();
      tapRequest.current = controller;
      try {
        const { restaurantId, placeName } = await getNearestRestaurant(
          { ...point, radiusM: tapRadius(viewBounds.current) },
          controller.signal,
        );
        // 응답이 이미 와 있던 이전 요청은 abort로 못 막으니 결과를 버린다
        if (controller.signal.aborted) return;
        if (restaurantId !== null) setSelectedId(restaurantId);
        else if (placeName) toast(`${eunNeun(placeName)} 아직 먹장깨기에 없는 가게예요`);
        else toast('이 자리에서 가게를 찾지 못했어요');
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
  // 핀을 고르거나 지역 시트를 열면, 아직 오는 중인 지도 누르기 결과는 버린다
  const pickRestaurant = useCallback((restaurantId: number) => {
    tapRequest.current?.abort();
    setSelectedId(restaurantId);
  }, []);
  const openRegion = useCallback(() => {
    tapRequest.current?.abort();
    setRegionOpen(true);
  }, []);
  const regionCenter =
    region?.lat && region.lng ? { lat: region.lat, lng: region.lng } : SEOUL_CENTER;
  const focused = focus && focus.regionId === region?.regionId ? focus : null;
  const center = focused?.coords ?? regionCenter;
  const myMukkaebi = summary.data?.mukkaebi;

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
            onPinClick={pickRestaurant}
            onMapClick={findAt}
            onBoundsChange={loadPins}
            recenterKey={focused?.key}
            me={
              live && {
                coords: live,
                marker: (
                  <MyLocationMarker
                    wearing={myMukkaebi ? wearingOf(myMukkaebi) : {}}
                    stage={myMukkaebi?.stage}
                  />
                ),
              }
            }
          />
        ) : regionError ? (
          <EmptyState title="내 동네를 불러오지 못했어요" onRetry={retry} />
        ) : (
          <Loading label="지도를 준비하는 중" />
        )}

        <div className={styles.overlayTop}>
          <RegionChip region={region} variant="map" onClick={openRegion} />
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

        {region && (
          <button
            type="button"
            className={styles.locate}
            aria-label="내 위치로 이동"
            data-on={Boolean(live)}
            onClick={locate}
          >
            <img src={locateIcon} alt="" width={22} height={22} />
          </button>
        )}

        <Link to="/visits/new" className={styles.fab}>
          <img src={flagIcon} alt="" width={22} height={22} />
          정복하기
        </Link>
      </section>

      <PreviewSheet restaurantId={selectedId} coords={live ?? coords} onClose={closePreview} />
      <RegionSelectSheet open={regionOpen} onClose={() => setRegionOpen(false)} />
    </div>
  );
}
