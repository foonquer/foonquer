import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getRecommendations, type RecommendationItem } from '../../api/restaurants';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { FilterChips } from '../../components/Chips';
import { RegionChip } from '../../components/RegionChip';
import { RegionSelectSheet } from '../../components/RegionSelectSheet';
import { RestaurantCard } from '../../components/RestaurantCard';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { useViewRegion } from '../../lib/region';
import { useMyCoords } from '../../lib/useMyCoords';
import { parseRecoType, RECO_EMPTY, RECO_OPTIONS } from './recoTypes';
import styles from './RecommendationList.module.css';

const PAGE_SIZE = 20;

type Loaded = {
  key: string;
  items: RecommendationItem[];
  page: number;
  totalCount: number;
  hasNext: boolean;
};

/** 추천 맛집 전체 목록 /recommendations/list?type= (RECO-01) */
export function RecommendationListPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const type = parseRecoType(params.get('type'));
  const { region, error: regionError, retry } = useViewRegion();
  const { coords } = useMyCoords();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<{ key: string; error: unknown } | null>(null);
  /** 더 보기를 부르는 중인 조건 (조건이 바뀌면 버튼을 다시 쓸 수 있다) */
  const [loadingMoreKey, setLoadingMoreKey] = useState<string | null>(null);
  /** 오류 화면에서 다시 시도할 때 올린다 */
  const [attempt, setAttempt] = useState(0);
  const [regionOpen, setRegionOpen] = useState(false);

  // 위치는 거리 표시에만 쓰여서 조건에 넣지 않는다: 먼저 위치 없이 보여 주고,
  // 위치가 오면 같은 조건으로 다시 받아 거리만 채운다.
  const key = JSON.stringify([type, region?.regionId]);
  const coordsKey = JSON.stringify(coords);
  const load = (page: number) =>
    getRecommendations({
      type,
      regionId: region!.regionId,
      lat: coords?.lat,
      lng: coords?.lng,
      page,
      size: PAGE_SIZE,
    });

  useEffect(() => {
    if (!region) return;
    let alive = true;
    // 같은 조건에서 위치만 바뀌어 다시 받을 때는 이미 펼친 쪽까지 받고,
    // 실패하면 보던 목록은 그대로 두고 알리기만 한다
    const shown = loaded?.key === key ? loaded : null;
    Promise.all(Array.from({ length: shown?.page ?? 1 }, (_, i) => load(i + 1))).then(
      (pages) => {
        if (!alive) return;
        setLoaded({ key, ...pages[pages.length - 1], items: pages.flatMap((p) => p.items) });
        setError((prev) => (prev?.key === key ? null : prev));
      },
      (err: unknown) => {
        if (!alive) return;
        if (shown) toast(errorMessage(err));
        else setError({ key, error: err });
      },
    );
    return () => {
      alive = false;
    };
    // key·coordsKey가 조건을 모두 담고 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, coordsKey, attempt]);

  const current = loaded?.key === key ? loaded : null;
  const currentError = error?.key === key ? error.error : null;

  const loadMore = async () => {
    if (!current) return;
    const from = current;
    setLoadingMoreKey(from.key);
    try {
      const data = await load(from.page + 1);
      // 그사이 조건이 바뀌었거나 목록을 새로 받았으면 버린다
      setLoaded((prev) =>
        prev === from ? { ...prev, ...data, items: [...prev.items, ...data.items] } : prev,
      );
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setLoadingMoreKey((k) => (k === from.key ? null : k));
    }
  };

  const area = region ? `${region.sigunguName} ${region.dongName}` : '';

  return (
    <Screen>
      <AppHeader title="추천 맛집" />
      <div className={styles.content}>
        <RegionChip region={region} onClick={() => setRegionOpen(true)} />
        <div className={styles.chips}>
          <FilterChips
            label="추천 기준"
            options={RECO_OPTIONS}
            value={type}
            onChange={(next) => setParams({ type: next }, { replace: true })}
          />
        </div>
        {regionError ? (
          <EmptyState title="내 동네를 불러오지 못했어요" onRetry={retry} />
        ) : currentError ? (
          <EmptyState
            title={errorMessage(currentError)}
            onRetry={() => {
              setError(null);
              setAttempt((a) => a + 1);
            }}
          />
        ) : !current ? (
          <Loading label="추천 맛집을 불러오는 중" />
        ) : current.items.length === 0 ? (
          <EmptyState title="아직 추천할 맛집이 없어요" description={RECO_EMPTY[type]} />
        ) : (
          <>
            <h2 className={styles.title}>
              {area} 추천 맛집 {current.totalCount}곳
            </h2>
            <p className={styles.note}>동네 주민 방문·재방문·방문 인증 평점 기준</p>
            <ol className={styles.list}>
              {current.items.map((item) => (
                <li key={item.restaurantId}>
                  <RestaurantCard item={item} />
                </li>
              ))}
            </ol>
            {current.hasNext && (
              <Button
                variant="white"
                size="sm"
                onClick={loadMore}
                disabled={loadingMoreKey === key}
              >
                더 보기
              </Button>
            )}
          </>
        )}
      </div>
      <RegionSelectSheet open={regionOpen} onClose={() => setRegionOpen(false)} />
    </Screen>
  );
}
