import { Link, useSearchParams } from 'react-router';
import { getVisitedRestaurants, type VisitedRestaurant } from '../../api/profile';
import { getMySigungus } from '../../api/ranking';
import { getMe } from '../../api/users';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { SeasonSelect } from '../../components/SeasonSelect';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { formatScore, joinDot } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { usePaged } from '../../lib/usePaged';
import styles from './MyRecords.module.css';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** "2026-09-25T…+09:00" → "목" (한국 날짜 기준) */
const weekdayOf = (iso: string) => WEEKDAYS[new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay()];

/** 정복한 날짜별로 달 묶음을 만든다 (최근 정복 순 그대로) */
function byMonth(items: VisitedRestaurant[]) {
  const groups: { month: string; items: VisitedRestaurant[] }[] = [];
  for (const item of items) {
    const month = `${Number(item.conqueredAt.slice(5, 7))}월`;
    const last = groups[groups.length - 1];
    if (last?.month === month) last.items.push(item);
    else groups.push({ month, items: [item] });
  }
  return groups;
}

/** 정복 기록 /me/conquests?seasonId= (PROFILE-02, 요약은 RANK-03) */
export function ConquestsPage() {
  const [params, setParams] = useSearchParams();
  const seasonId = Number(params.get('seasonId')) || undefined;
  const me = useAsync(getMe, []);
  const summary = useAsync(() => getMySigungus(seasonId), [seasonId]);
  const list = usePaged(
    (page) =>
      // 내 id(USER-01)를 받기 전에는 부르지 않는다 — 받으면 deps가 바뀌어 다시 부른다. 실패는 me.error로 보여 준다
      me.data
        ? getVisitedRestaurants(me.data.id, { seasonId, page, size: 30 })
        : new Promise<never>(() => {}),
    [me.data?.id, seasonId],
  );

  const error = me.error ?? (list.items.length === 0 ? list.error : undefined);
  return (
    <Screen>
      <AppHeader
        title="정복 기록"
        right={
          summary.data && (
            <SeasonSelect
              season={summary.data.season}
              onChange={(id) => setParams({ seasonId: String(id) }, { replace: true })}
            />
          )
        }
      />
      <div className={styles.content}>
        {summary.data && (
          <p className={styles.summary}>
            <strong>{summary.data.season.name}</strong>
            <span>
              {summary.data.totalConquestCount}곳 · {summary.data.sigunguCount}개 구
            </span>
          </p>
        )}
        {error ? (
          <EmptyState title={errorMessage(error)} onRetry={me.error ? me.reload : list.reload} />
        ) : list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.items.length === 0 ? (
          <EmptyState
            title="이 시즌에 정복한 가게가 없어요"
            description="방문 인증하고 맛 별점을 남기면 여기에 쌓여요."
          />
        ) : (
          byMonth(list.items).map((group) => (
            <section key={group.month} className={styles.group} aria-label={group.month}>
              <h2 className={styles.month}>{group.month}</h2>
              <ul className={styles.rows}>
                {group.items.map((r) => (
                  <li key={`${r.restaurantId}-${r.conqueredAt}`}>
                    <Link
                      to={r.reviewId ? `/reviews/${r.reviewId}` : `/restaurants/${r.restaurantId}`}
                      className={styles.row}
                    >
                      <span className={styles.day}>
                        <strong>{Number(r.conqueredAt.slice(8, 10))}</strong>
                        {weekdayOf(r.conqueredAt)}
                      </span>
                      <span className={styles.rowText}>
                        <span className={styles.rowName}>{r.name}</span>
                        <span className={styles.rowMeta}>
                          {joinDot([r.sigunguName, r.categoryName])}
                        </span>
                      </span>
                      {r.overallScore !== null && (
                        <span className={styles.score}>
                          맛 <span className={styles.star}>★</span> {formatScore(r.overallScore)}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        {list.hasNext && (
          <Button variant="white" size="sm" onClick={list.loadMore} disabled={list.loading}>
            더 보기
          </Button>
        )}
      </div>
    </Screen>
  );
}
