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
  const { coords, ready } = useMyCoords();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<{ key: string; error: unknown } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);

  const key = JSON.stringify([type, region?.regionId, coords]);
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
    if (!region || !ready) return;
    let alive = true;
    load(1).then(
      (data) => alive && setLoaded({ key, ...data }),
      (err: unknown) => alive && setError({ key, error: err }),
    );
    return () => {
      alive = false;
    };
    // key가 조건을 모두 담고 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  const current = loaded?.key === key ? loaded : null;
  const currentError = error?.key === key ? error.error : null;

  const loadMore = async () => {
    if (!current) return;
    setLoadingMore(true);
    try {
      const data = await load(current.page + 1);
      setLoaded({ ...current, ...data, items: [...current.items, ...data.items] });
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setLoadingMore(false);
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
          <EmptyState title={errorMessage(currentError)} />
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
              <Button variant="white" size="sm" onClick={loadMore} disabled={loadingMore}>
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
