import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { getSearchHome, type Category } from '../../api/restaurants';
import chevronRight from '../../assets/icons/chevron-right-green.svg';
import { AppHeader } from '../../components/AppHeader';
import { RegionChip } from '../../components/RegionChip';
import { RegionSelectSheet } from '../../components/RegionSelectSheet';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import {
  recentLabel,
  recentSearches,
  searchPath,
  type RecentSearch,
} from '../../lib/recentSearches';
import { useViewRegion } from '../../lib/region';
import { useAsync } from '../../lib/useAsync';
import { SearchBar } from './SearchBar';
import styles from './Search.module.css';

/** 검색 홈: 검색창·지역·최근 검색·음식 종류 (SEARCH-01) */
export function SearchHome() {
  const navigate = useNavigate();
  const focusSearch =
    (useLocation().state as { focusSearch?: boolean } | null)?.focusSearch === true;
  const { region, error: regionError, retry } = useViewRegion();
  const [recent, setRecent] = useState(recentSearches.list);
  const [regionOpen, setRegionOpen] = useState(false);
  const home = useAsync(
    () => (region ? getSearchHome(region.regionId) : new Promise<never>(() => {})),
    [region?.regionId],
  );

  const go = (item: RecentSearch) => {
    setRecent(recentSearches.add(item));
    navigate(searchPath(item));
  };
  const pickCategory = (c: Category) =>
    go({ type: 'category', categoryId: c.categoryId, name: c.name });

  return (
    <Screen>
      <AppHeader title="맛집 검색" />
      <div className={styles.content}>
        {/* 홈 검색창을 누르고 들어왔을 때만 바로 입력할 수 있게 (빈 화면의 "맛집 찾으러 가기"는 둘러보기) */}
        <SearchBar
          autoFocus={focusSearch}
          onSubmit={(keyword) => go({ type: 'keyword', keyword })}
        />
        <div className={styles.regionRow}>
          <RegionChip region={region} onClick={() => setRegionOpen(true)} />
        </div>

        {recent.length > 0 && (
          <section className={styles.section} aria-label="최근 검색">
            <h2 className={styles.sectionTitle}>최근 검색</h2>
            <ul className={styles.recent}>
              {recent.map((item) => (
                <li key={`${item.type}-${recentLabel(item)}`} className={styles.recentChip}>
                  <button type="button" onClick={() => go(item)}>
                    {recentLabel(item)}
                  </button>
                  <button
                    type="button"
                    className={styles.recentRemove}
                    aria-label={`최근 검색 ${recentLabel(item)} 지우기`}
                    onClick={() => setRecent(recentSearches.remove(item))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.section} aria-label="음식 종류">
          <h2 className={styles.bigTitle}>오늘은 어떤 한 끼?</h2>
          <p className={styles.subTitle}>
            {region
              ? `${region.sigunguName} ${region.dongName}에서 다음 정복 장소를 찾아보세요.`
              : '동네에서 다음 정복 장소를 찾아보세요.'}
          </p>
          {regionError ? (
            <EmptyState title="내 동네를 불러오지 못했어요" onRetry={retry} />
          ) : home.error ? (
            <EmptyState title={errorMessage(home.error)} onRetry={home.reload} />
          ) : !home.data ? (
            <Loading label="음식 종류를 불러오는 중" />
          ) : (
            <ul className={styles.categories}>
              {home.data.categories.map((c) => (
                <li key={c.categoryId}>
                  <button type="button" className={styles.category} onClick={() => pickCategory(c)}>
                    <span className={styles.categoryName}>{c.name}</span>
                    <span className={styles.categoryCount}>{c.restaurantCount}곳</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link to="/recommendations" className={styles.banner}>
          <span className={styles.bannerTitle}>현지인이 자주 찾는 맛집</span>
          <span className={styles.bannerText}>
            {'위치 인증한 이웃들의 방문 기록으로\n다음 맛집을 골라보세요.'}
          </span>
          <img src={chevronRight} alt="" className={styles.bannerArrow} width={6} height={12} />
        </Link>
      </div>
      <RegionSelectSheet open={regionOpen} onClose={() => setRegionOpen(false)} />
    </Screen>
  );
}
