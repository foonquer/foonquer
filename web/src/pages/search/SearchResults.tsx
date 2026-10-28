import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  searchRestaurants,
  type SearchResult,
  type SearchScope,
  type SearchSort,
} from '../../api/restaurants';
import mukkaebi from '../../assets/illust/mukkaebi.svg';
import { AppHeader } from '../../components/AppHeader';
import { Button, ButtonLink } from '../../components/Button';
import { FilterChips } from '../../components/Chips';
import { RegionSelectSheet } from '../../components/RegionSelectSheet';
import { RestaurantCard } from '../../components/RestaurantCard';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { recentSearches, searchPath } from '../../lib/recentSearches';
import { useViewRegion } from '../../lib/region';
import { useMyCoords } from '../../lib/useMyCoords';
import { SearchBar } from './SearchBar';
import styles from './Search.module.css';

const SORT_OPTIONS = [
  { value: 'LOCAL_POPULAR', label: '현지인 인기' },
  { value: 'REVISIT', label: '재방문 많음' },
  { value: 'DISTANCE', label: '가까운 순' },
] as const;

const SORT_LABEL: Record<SearchSort, string> = {
  LOCAL_POPULAR: '현지인 인기 순',
  REVISIT: '재방문 많은 순',
  DISTANCE: '가까운 순',
};

const PAGE_SIZE = 20;

type Props = {
  keyword: string | null;
  categoryId: number | null;
  categoryName: string | null;
  sort: SearchSort;
  scope: SearchScope;
};

type Loaded = { key: string; result: SearchResult; message: string };

/** 키워드·음식 종류 검색 결과 (SEARCH-02) */
export function SearchResults({ keyword, categoryId, categoryName, sort, scope }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { region, error: regionError, retry } = useViewRegion();
  const { coords, ready } = useMyCoords();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<{ key: string; error: unknown } | null>(null);
  /** 더 보기를 부르는 중인 조건 (조건이 바뀌면 버튼을 다시 쓸 수 있다) */
  const [loadingMoreKey, setLoadingMoreKey] = useState<string | null>(null);
  /** 오류 화면에서 다시 시도할 때 올린다 */
  const [attempt, setAttempt] = useState(0);
  const [regionOpen, setRegionOpen] = useState(false);

  // 검색 조건. 위치는 거리 표시에만 쓰여서(가까운 순 제외) 조건에 넣지 않는다:
  // 위치가 늦게 오면 같은 조건으로 다시 받아 거리만 채운다.
  const key = JSON.stringify([keyword, categoryId, sort, scope, region?.regionId]);
  const coordsKey = JSON.stringify(coords);
  // 가까운 순만 위치 응답을 기다린다
  const canSearch = !!region && (sort !== 'DISTANCE' || ready);
  const query = (page: number) => ({
    keyword: keyword ?? undefined,
    categoryId: categoryId ?? undefined,
    regionId: region!.regionId,
    scope,
    sort,
    lat: coords?.lat,
    lng: coords?.lng,
    page,
    size: PAGE_SIZE,
  });

  useEffect(() => {
    if (!canSearch) return;
    let alive = true;
    searchRestaurants(query(1)).then(
      ({ data, message }) => {
        if (!alive) return;
        setLoaded({ key, result: data, message });
        setError((prev) => (prev?.key === key ? null : prev));
      },
      (err: unknown) => alive && setError({ key, error: err }),
    );
    return () => {
      alive = false;
    };
    // key·coordsKey가 조건을 모두 담고 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, coordsKey, canSearch, attempt]);

  const current = loaded?.key === key ? loaded : null;
  const currentError = error?.key === key ? error.error : null;

  const loadMore = async () => {
    if (!current) return;
    const from = current;
    setLoadingMoreKey(from.key);
    try {
      const { data } = await searchRestaurants(query(from.result.page + 1));
      // 그사이 조건이 바뀌었거나 목록을 새로 받았으면 버린다
      setLoaded((prev) =>
        prev === from
          ? { ...prev, result: { ...data, items: [...prev.result.items, ...data.items] } }
          : prev,
      );
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setLoadingMoreKey((k) => (k === from.key ? null : k));
    }
  };

  const change = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const changeSort = (value: SearchSort) => {
    if (value === 'DISTANCE' && !coords) {
      toast('가까운 순으로 보려면 위치 권한을 켜 주세요');
      return;
    }
    change({ sort: value === 'LOCAL_POPULAR' ? null : value });
  };

  const searchKeyword = (next: string) => {
    recentSearches.add({ type: 'keyword', keyword: next });
    navigate(searchPath({ type: 'keyword', keyword: next }), { replace: true });
  };

  const area = region
    ? scope === 'SIGUNGU'
      ? `${region.sigunguName} 전체`
      : `${region.sigunguName} ${region.dongName}`
    : '';
  const subject = keyword ? `‘${keyword}’` : (categoryName ?? '음식 종류');
  const result = current?.result;

  let body;
  if (regionError) body = <EmptyState title="내 동네를 불러오지 못했어요" onRetry={retry} />;
  else if (currentError)
    body = (
      <EmptyState
        title={errorMessage(currentError)}
        onRetry={() => {
          setError(null);
          setAttempt((a) => a + 1);
        }}
      />
    );
  else if (!result) body = <Loading label="검색하는 중" />;
  else if (result.items.length === 0) {
    const guide = result.emptyGuide;
    body = (
      <div className={styles.empty}>
        <span className={styles.emptyCircle}>
          <img src={mukkaebi} alt="" />
        </span>
        <p className={styles.emptyTitle}>
          {keyword ? current.message : `${area}에 ${subject} 맛집이 아직 없어요`}
        </p>
        <p className={styles.emptyText}>
          {`${area} 근처에는 아직 없어요.\n지역을 넓히거나 다른 이름으로 찾아보세요.`}
        </p>
        <div className={styles.emptyChips}>
          {guide?.canSearchSigungu && region && (
            <button type="button" onClick={() => change({ scope: 'SIGUNGU' })}>
              {region.sigunguName} 전체에서 찾기
            </button>
          )}
          {guide?.similarKeywords.map((similar) => (
            <button key={similar} type="button" onClick={() => searchKeyword(similar)}>
              비슷한 메뉴: {similar}
            </button>
          ))}
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <h2 className={styles.resultTitle}>
          {keyword
            ? `${subject} 검색 결과 ${result.totalCount}곳`
            : `${area} ${subject} ${result.totalCount}곳`}
        </h2>
        <p className={styles.resultNote}>
          {keyword
            ? `가게 이름과 영수증에 적힌 메뉴에서 찾았어요 · ${SORT_LABEL[sort]}`
            : `${area} · ${SORT_LABEL[sort]}`}
        </p>
        <ul className={styles.list}>
          {result.items.map((item) => (
            <li key={item.restaurantId}>
              <RestaurantCard
                item={item}
                note={item.matchedBy === 'MENU' ? `메뉴: ${item.matchedMenuName}` : null}
              />
            </li>
          ))}
        </ul>
        {result.hasNext && (
          <Button variant="white" size="sm" onClick={loadMore} disabled={loadingMoreKey === key}>
            결과 더 보기
          </Button>
        )}
      </>
    );
  }

  const empty = result?.items.length === 0;

  return (
    <Screen
      footer={
        empty ? (
          <Button radius={16} onClick={() => setRegionOpen(true)}>
            지역 바꾸기
          </Button>
        ) : (
          <ButtonLink to="/recommendations" variant="white" size="md">
            추천맛집에서 더 보기
          </ButtonLink>
        )
      }
    >
      <AppHeader title="검색 결과" onBack={() => navigate('/search', { replace: true })} />
      <div className={styles.content}>
        <SearchBar
          key={keyword ?? categoryName ?? ''}
          initial={keyword ?? categoryName ?? ''}
          onSubmit={searchKeyword}
        />
        {!empty && (
          <div className={styles.sortRow}>
            <FilterChips label="정렬" options={SORT_OPTIONS} value={sort} onChange={changeSort} />
          </div>
        )}
        <div className={styles.results}>{body}</div>
      </div>
      <RegionSelectSheet open={regionOpen} onClose={() => setRegionOpen(false)} />
    </Screen>
  );
}
