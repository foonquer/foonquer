import { Link, useParams } from 'react-router';
import { getReview } from '../../api/reviews';
import { AppHeader } from '../../components/AppHeader';
import { ButtonLink } from '../../components/Button';
import { ReviewCard } from '../../components/ReviewCard';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { ApiError, errorMessage } from '../../lib/api';
import { joinDot } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import styles from './Review.module.css';

/** 리뷰 상세 /reviews/:reviewId (REVIEW-04). 내 리뷰면 수정·삭제 */
export function ReviewDetailPage() {
  const reviewId = Number(useParams().reviewId);
  const { data: review, error, reload, mutate } = useAsync(() => getReview(reviewId), [reviewId]);

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Screen>
        <AppHeader title="리뷰" />
        <EmptyState
          title={notFound ? '리뷰를 찾을 수 없어요' : errorMessage(error)}
          onRetry={notFound ? undefined : reload}
        />
      </Screen>
    );
  }
  if (!review) {
    return (
      <Screen>
        <AppHeader title="리뷰" />
        <Loading />
      </Screen>
    );
  }

  const hasDetail = Boolean(review.detailScores || review.content || review.imageCount > 0);
  return (
    <Screen
      footer={
        review.isMine && (
          <ButtonLink to={`/reviews/${review.reviewId}/edit`}>
            {hasDetail ? '리뷰 수정하기' : '세부평가 남기고 포인트 쌓기'}
          </ButtonLink>
        )
      }
    >
      <AppHeader title={review.isMine ? '내 리뷰' : '리뷰'} />
      <div className={styles.content}>
        <Link
          to={`/restaurants/${review.restaurant.restaurantId}`}
          className={styles.restaurantCard}
        >
          <span className={styles.restaurantName}>{review.restaurant.name} ›</span>
          <span className={styles.restaurantMeta}>
            {joinDot([
              review.restaurant.categoryName,
              `${review.restaurant.sigunguName} ${review.restaurant.dongName}`,
            ])}
          </span>
        </Link>
        <ReviewCard review={review} onChange={(next) => mutate(() => next)} />
      </div>
    </Screen>
  );
}
