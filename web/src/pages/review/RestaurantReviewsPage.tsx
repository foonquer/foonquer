import { useState } from 'react';
import { useParams } from 'react-router';
import { getRestaurant } from '../../api/restaurants';
import { getRestaurantReviews, type RestaurantReviewSort } from '../../api/reviews';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { FilterChips } from '../../components/Chips';
import { ReviewCard } from '../../components/ReviewCard';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { Stars } from '../../components/StarRating';
import { errorMessage } from '../../lib/api';
import { formatScore, joinDot, noRatingText } from '../../lib/format';
import { scoreBand, tasteCriterion } from '../../lib/taste';
import { useAsync } from '../../lib/useAsync';
import { usePaged } from '../../lib/usePaged';
import { ScoreStats } from '../restaurant/ScoreStats';
import styles from './Review.module.css';

type Filter = 'ALL' | 'PHOTO' | 'REVISIT' | 'LOCAL';

const SORTS: { value: RestaurantReviewSort; label: string }[] = [
  { value: 'LATEST', label: '최신순' },
  { value: 'HELPFUL', label: '도움순' },
  { value: 'SCORE_HIGH', label: '별점 높은 순' },
  { value: 'SCORE_LOW', label: '별점 낮은 순' },
];

/** 방문 인증 리뷰 전체 /restaurants/:restaurantId/reviews (REVIEW-03) */
export function RestaurantReviewsPage() {
  const restaurantId = Number(useParams().restaurantId);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [sort, setSort] = useState<RestaurantReviewSort>('LATEST');
  const { data: r } = useAsync(() => getRestaurant(restaurantId), [restaurantId]);
  const list = usePaged(
    (page) =>
      getRestaurantReviews(restaurantId, {
        sort,
        photoOnly: filter === 'PHOTO' || undefined,
        localOnly: filter === 'LOCAL' || undefined,
        revisitOnly: filter === 'REVISIT' || undefined,
        page,
        size: 10,
      }),
    [restaurantId, filter, sort],
  );

  const score = r?.rating.score ?? null;
  return (
    <Screen>
      <AppHeader title="방문 인증 리뷰" />
      <div className={styles.content}>
        {r && (
          <section className={styles.card} aria-label="평가 요약">
            <p className={styles.restaurantMeta}>
              {joinDot([r.name, r.categoryName, `인증 평가 ${r.rating.reviewCount}개`])}
            </p>
            {score !== null ? (
              <div className={styles.summary}>
                <span className={styles.summaryScore}>{formatScore(score)}</span>
                <div>
                  <Stars value={score} size={18} />
                  <p className={styles.summaryText}>
                    맛 별점 · {tasteCriterion(score).text} ({scoreBand(score)})
                  </p>
                </div>
              </div>
            ) : (
              <p className={styles.summaryText}>{noRatingText(r?.rating.reviewCount ?? 0)}</p>
            )}
            <ScoreStats r={r} />
          </section>
        )}

        <FilterChips
          scroll
          label="리뷰 거르기"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: `전체 ${r?.rating.reviewCount ?? ''}`.trim() },
            { value: 'PHOTO', label: `사진 리뷰 ${r?.stats.photoReviewCount ?? ''}`.trim() },
            {
              value: 'REVISIT',
              label: `재방문 의사 있음 ${r?.stats.revisitIntentCount ?? ''}`.trim(),
            },
            { value: 'LOCAL', label: '로컬 리뷰' },
          ]}
        />
        <div className={styles.toolbar}>
          <span className={styles.count}>리뷰 {list.totalCount}개</span>
          <select
            className={styles.select}
            aria-label="정렬"
            value={sort}
            onChange={(e) => setSort(e.target.value as RestaurantReviewSort)}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {list.error && list.items.length === 0 ? (
          <EmptyState title={errorMessage(list.error)} onRetry={list.reload} />
        ) : list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.items.length === 0 ? (
          <EmptyState
            title="아직 인증 리뷰가 없어요"
            description="방문 인증하고 첫 리뷰를 남겨 보세요."
          />
        ) : (
          <div className={styles.list}>
            {list.items.map((review) => (
              <ReviewCard
                key={review.reviewId}
                review={review}
                onChange={(next) => list.update((i) => i.reviewId === next.reviewId, next)}
              />
            ))}
            {list.hasNext && (
              <Button
                variant="white"
                size="sm"
                block={false}
                className={styles.more}
                disabled={list.loading}
                onClick={list.loadMore}
              >
                더 보기
              </Button>
            )}
          </div>
        )}
      </div>
    </Screen>
  );
}
