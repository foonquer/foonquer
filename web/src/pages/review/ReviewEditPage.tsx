import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  deleteReview,
  getReview,
  getReviewAspects,
  type Review,
  updateReview,
} from '../../api/reviews';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { StarInput } from '../../components/StarRating';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatKoreanDate, formatPoint, formatScore, joinDot } from '../../lib/format';
import { tasteCriterion } from '../../lib/taste';
import { useAsync } from '../../lib/useAsync';
import { ReviewForm } from './ReviewForm';
import {
  aspectsOf,
  detailScoresOf,
  keyFromImageUrl,
  photoKeysOf,
  type ReviewFormValue,
} from './reviewValue';
import styles from './Review.module.css';

function formOf(review: Review): ReviewFormValue {
  return {
    scores: review.detailScores ?? {},
    aspects: Object.fromEntries(review.aspects.map((a) => [a.aspectId, a.polarity])),
    content: review.content ?? '',
    photos: review.imageUrls.map((url) => ({ key: keyFromImageUrl(url), url })),
  };
}

async function loadEdit(reviewId: number) {
  const [review, aspects] = await Promise.all([getReview(reviewId), getReviewAspects()]);
  return { review, aspects: aspects.items };
}

/** 리뷰 수정 /reviews/:reviewId/edit (REVIEW-06·07) */
export function ReviewEditPage() {
  const reviewId = Number(useParams().reviewId);
  const { data, error, reload } = useAsync(() => loadEdit(reviewId), [reviewId]);

  if (error) {
    return (
      <Screen>
        <AppHeader title="리뷰 수정" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="리뷰 수정" />
        <Loading />
      </Screen>
    );
  }
  if (!data.review.isMine) {
    return (
      <Screen>
        <AppHeader title="리뷰 수정" />
        <EmptyState title="내 리뷰만 고칠 수 있어요" />
      </Screen>
    );
  }
  return <EditForm review={data.review} aspects={data.aspects} />;
}

function EditForm({
  review,
  aspects,
}: {
  review: Review;
  aspects: { aspectId: number; name: string }[];
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [taste, setTaste] = useState(review.overallScore);
  const [value, setValue] = useState(() => formOf(review));
  const [photosChanged, setPhotosChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const scores = detailScoresOf(value);
  const hasDetail = Boolean(review.detailScores || review.content || review.imageCount > 0);
  const back = () => navigate(`/reviews/${review.reviewId}`, { replace: true });

  const submit = async () => {
    if (scores === 'PARTIAL') return;
    setSaving(true);
    try {
      const result = await updateReview(review.reviewId, {
        overallScore: taste !== review.overallScore ? taste : undefined,
        detailScores: scores,
        aspects: aspectsOf(value),
        content: value.content.trim() || null,
        imageKeys: photosChanged ? await photoKeysOf(value.photos) : undefined,
      });
      toast({
        message:
          result.rewards.point > 0
            ? `리뷰를 고쳤어요 · +${formatPoint(result.rewards.point)} 적립`
            : '리뷰를 고쳤어요',
        check: true,
      });
      back();
    } catch (err) {
      toast(errorMessage(err));
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await deleteReview(review.reviewId);
      toast('리뷰를 삭제했어요. 맛 별점과 정복 기록은 그대로 남아요.');
      back();
    } catch (err) {
      toast(errorMessage(err));
      setSaving(false);
      setDeleteOpen(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          {scores === 'PARTIAL' && (
            <p className={styles.hint}>세부 별점은 네 항목을 모두 골라 주세요</p>
          )}
          <Button onClick={submit} disabled={saving || scores === 'PARTIAL'}>
            수정 완료
          </Button>
        </>
      }
    >
      <AppHeader
        title="리뷰 수정"
        right={
          hasDetail && (
            <button type="button" className={styles.linkButton} onClick={() => setDeleteOpen(true)}>
              삭제
            </button>
          )
        }
      />
      <div className={styles.content}>
        <section className={styles.card} aria-label="맛 별점">
          <p className={styles.restaurantName}>{review.restaurant.name}</p>
          <p className={styles.restaurantMeta}>
            {joinDot([
              review.visitedAt && `${formatKoreanDate(review.visitedAt)} 방문`,
              `✓ ${review.verificationMethod === 'RECEIPT' ? '영수증 인증' : '현장 인증'}`,
            ])}
          </p>
          <div className={styles.scoreRow}>
            <span className={styles.scoreLabel}>맛</span>
            <StarInput label="맛 별점" value={taste} onChange={setTaste} step={0.5} size={26} />
          </div>
          <p className={styles.cardHint} style={{ marginTop: 0 }}>
            {formatScore(taste)} · {tasteCriterion(taste).text}
          </p>
        </section>
        <ReviewForm
          value={value}
          onChange={(next) => {
            if (next.photos !== value.photos) setPhotosChanged(true);
            setValue(next);
          }}
          aspectOptions={aspects}
        />
        <p className={styles.notice}>
          별점을 바꾸면 가게 평균에도 바로 반영돼요. 보상은 다시 받을 수 없어요.
        </p>
      </div>
      <Dialog
        open={deleteOpen}
        title="리뷰를 삭제할까요?"
        description={['삭제한 리뷰는 되돌릴 수 없어요. 정복 기록은 그대로 남아요.']}
        confirmLabel="삭제"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={remove}
        busy={saving}
      />
    </Screen>
  );
}
