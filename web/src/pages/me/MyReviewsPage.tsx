import { useState } from 'react';
import { getMyReviews } from '../../api/reviews';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { FilterChips } from '../../components/Chips';
import { ReviewCard } from '../../components/ReviewCard';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { usePaged } from '../../lib/usePaged';
import styles from '../review/Review.module.css';

/** 내 리뷰 /me/reviews (REVIEW-05) */
export function MyReviewsPage() {
  const [sort, setSort] = useState<'LATEST' | 'HELPFUL'>('LATEST');
  const list = usePaged((page) => getMyReviews({ sort, page, size: 10 }), [sort]);

  return (
    <Screen>
      <AppHeader title="내 리뷰" />
      <div className={styles.content}>
        <FilterChips
          label="정렬"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'LATEST', label: '최신순' },
            { value: 'HELPFUL', label: '도움순' },
          ]}
        />
        <span className={styles.count}>전체 {list.totalCount}</span>
        {list.error && list.items.length === 0 ? (
          <EmptyState title={errorMessage(list.error)} onRetry={list.reload} />
        ) : list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.items.length === 0 ? (
          <EmptyState
            title="아직 남긴 리뷰가 없어요"
            description="방문 인증하고 맛 별점을 남기면 여기에 모여요."
            action={{ label: '맛집 찾으러 가기', to: '/search' }}
          />
        ) : (
          <div className={styles.list}>
            {list.items.map((review) => (
              <ReviewCard key={review.reviewId} review={review} showRestaurant />
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
