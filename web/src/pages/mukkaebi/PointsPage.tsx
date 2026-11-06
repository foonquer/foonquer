import { useState } from 'react';
import { Link } from 'react-router';
import { getPointHistory, type PointHistory } from '../../api/mukkaebi';
import { getMyPoints } from '../../api/points';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { FilterChips } from '../../components/Chips';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { formatKoreanDate, formatPoint } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { usePaged } from '../../lib/usePaged';
import styles from './Mukkaebi.module.css';

type Filter = 'ALL' | 'EARN' | 'SPEND';

/** 적립 이유 → 아래 줄 설명 (서버 reward_policy.reason) */
const REASON: Record<string, string> = {
  VISIT_VERIFIED: '방문 인증 완료',
  FIRST_CONQUEST: '새 가게 정복 보상',
  REVIEW_DETAIL: '세부평가 보상',
  REVIEW_TEXT: '리뷰 작성 보상',
  REVIEW_PHOTO: '사진 리뷰 보상',
  HELPFUL_RECEIVED: '도움돼요 받음',
  REVIEW_VOTE: '리뷰 평가 참여',
  LEVEL_UP: '성장 보상',
  TIER_UP: '티어 상승 보상',
  SEASON_REWARD: '시즌 보상',
  ACHIEVEMENT: '업적 보상',
  ITEM_BOX: '아이템 상자',
  PURCHASE: '상점',
};

/** 날짜별 묶음 (최신순 그대로) */
function byDate(items: PointHistory[]) {
  const groups: { date: string; items: PointHistory[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last?.date === item.date) last.items.push(item);
    else groups.push({ date: item.date, items: [item] });
  }
  return groups;
}

/** 먹포인트 /me/points — 잔액·이번 달 모은/쓴 포인트·내역 (POINT-01·02) */
export function PointsPage() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const summary = useAsync(getMyPoints, []);
  const list = usePaged((page) => getPointHistory({ type: filter, page, size: 30 }), [filter]);

  return (
    <Screen>
      <AppHeader title="먹포인트" />
      <div className={styles.content}>
        <section className={styles.pointHero} aria-label="보유 먹포인트">
          <p className={styles.cardHead}>
            <span>보유 먹포인트</span>
            <Link to="/me/mukkaebi/shop">상점 가기 ›</Link>
          </p>
          <p className={styles.pointBig}>
            {summary.data ? formatPoint(summary.data.pointBalance) : '–'}
          </p>
          {summary.data && (
            <p className={styles.caption} style={{ textAlign: 'left' }}>
              이번 달 모은 포인트 +{formatPoint(summary.data.monthEarned)} · 쓴 포인트 −
              {formatPoint(summary.data.monthSpent)}
            </p>
          )}
        </section>

        <FilterChips
          label="내역 거르기"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: '전체' },
            { value: 'EARN', label: '모은 내역' },
            { value: 'SPEND', label: '쓴 내역' },
          ]}
        />

        {list.error && list.items.length === 0 ? (
          <EmptyState title={errorMessage(list.error)} onRetry={list.reload} />
        ) : list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.items.length === 0 ? (
          <EmptyState
            title="아직 내역이 없어요"
            description="방문 인증하고 리뷰를 쓰면 먹포인트가 쌓여요."
          />
        ) : (
          byDate(list.items).map((g) => (
            <section key={g.date} aria-label={formatKoreanDate(g.date) ?? g.date}>
              <h2 className={styles.dateHead}>{formatKoreanDate(g.date)}</h2>
              <ul className={styles.history}>
                {g.items.map((h) => (
                  <li key={h.pointHistoryId}>
                    <span className={styles.historyText}>
                      <strong>{h.title}</strong>
                      <span>{REASON[h.reason] ?? ''}</span>
                    </span>
                    <span className={styles.amount} data-spend={h.amount < 0}>
                      {h.amount > 0 ? '+' : '−'}
                      {formatPoint(Math.abs(h.amount))}
                    </span>
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
