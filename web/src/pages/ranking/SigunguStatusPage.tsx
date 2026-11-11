import { Link, useParams, useSearchParams } from 'react-router';
import { getMySigunguDetail } from '../../api/ranking';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { formatRecentDay, joinDot } from '../../lib/format';
import { usePaged } from '../../lib/usePaged';
import { RankList } from './RankParts';
import styles from './Ranking.module.css';

/** "오늘 정복" / "어제" / "9월 21일" */
const conqueredDay = (iso: string) => {
  const day = formatRecentDay(iso);
  return day === '오늘' ? '오늘 정복' : day;
};

/** 구 현황 /ranking/sigungus/:sigunguId/status?seasonId= — 내 티어·순위·랭킹 미리보기·정복한 가게 (RANK-04) */
export function SigunguStatusPage() {
  const sigunguId = Number(useParams().sigunguId);
  const seasonId = Number(useSearchParams()[0].get('seasonId')) || undefined;
  // 가게 목록은 "더 보기"로 이어 붙이고, 티어·순위는 1쪽 응답에서 쓴다
  const shops = usePaged(
    async (page) => {
      const detail = await getMySigunguDetail(sigunguId, { seasonId, page });
      return { ...detail.restaurants, detail };
    },
    [sigunguId, seasonId],
  );
  const data = shops.first?.detail;
  const error = data ? undefined : shops.error;
  const reload = shops.reload;

  if (error) {
    return (
      <Screen>
        <AppHeader title="구 현황" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="구 현황" />
        <Loading />
      </Screen>
    );
  }

  const progress = data.tierProgress.nextTierAt
    ? (data.conquestCount / data.tierProgress.nextTierAt) * 100
    : 100;
  const query = seasonId ? `?seasonId=${seasonId}` : '';
  return (
    <Screen>
      <AppHeader title={`${data.sigunguName} 현황`} />
      <div className={styles.content}>
        <section className={styles.card} aria-label="내 티어">
          <p className={styles.selectedName}>{data.tierTitle}</p>
          <p className={styles.tierLine}>{data.conquestCount}곳 정복</p>
          <p className={styles.muted}>
            {data.nextTier
              ? `${data.nextTier.tierName}까지 ${data.nextTier.remaining}곳 남았어요`
              : '가장 높은 티어예요'}
          </p>
          <span
            className={styles.bar}
            data-tone="gold"
            aria-hidden="true"
            style={{ marginTop: 10 }}
          >
            <span style={{ width: `${progress}%` }} />
          </span>
          {data.tierProgress.nextTierAt && (
            <p className={styles.cardHead} style={{ marginTop: 6 }}>
              <span>{data.tierName}</span>
              <span>
                {data.tierProgress.nextTierName} {data.tierProgress.nextTierAt}곳
              </span>
            </p>
          )}
        </section>

        <section className={styles.card} aria-label="내 순위">
          <p className={styles.cardHead}>
            <strong>{data.season.name} · 정복 수 기준</strong>
            <span>{data.activeExplorerCount}명 활동 탐험가 중</span>
          </p>
          <p className={styles.rankLine}>
            <span className={styles.rankBig}>{data.rank ? `${data.rank}위` : '–'}</span>
            {data.topPercent !== null && (
              <span className={styles.top}>상위 {data.topPercent}%</span>
            )}
          </p>
          {data.rank !== null && data.mukjjangGap > 0 && (
            <p className={styles.muted}>먹짱까지 {data.mukjjangGap}곳</p>
          )}
        </section>

        {data.rankingPreview.length > 0 && (
          <>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>{data.sigunguName} 랭킹</h2>
              <Link to={`/ranking/sigungus/${data.sigunguId}${query}`}>TOP 50 보기 ›</Link>
            </div>
            <RankList rows={data.rankingPreview} label={`${data.sigunguName} 랭킹`} />
          </>
        )}

        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>내가 정복한 가게</h2>
          <span>{shops.totalCount}곳</span>
        </div>
        {shops.items.length === 0 && !shops.loading ? (
          <p className={styles.note}>이번 시즌 이 구에서 정복한 가게가 아직 없어요.</p>
        ) : (
          <ul className={styles.rows}>
            {shops.items.map((r) => (
              <li key={`${r.restaurantId}-${r.conqueredAt}`}>
                <Link to={`/restaurants/${r.restaurantId}`}>
                  <span className={styles.rowName}>
                    {r.name}
                    <br />
                    <span className={styles.rowSub}>{joinDot([r.categoryName])}</span>
                  </span>
                  <span className={styles.rowSub}>{conqueredDay(r.conqueredAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {shops.error !== undefined && (
          <p className={styles.note} role="alert">
            {errorMessage(shops.error)}
          </p>
        )}
        {shops.hasNext && (
          <Button variant="white" size="sm" onClick={shops.loadMore} disabled={shops.loading}>
            더 보기
          </Button>
        )}
      </div>
    </Screen>
  );
}
