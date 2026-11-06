import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { addReviewDetail, getReview, getReviewAspects, type Review } from '../../api/reviews';
import { getVerification } from '../../api/visits';
import mukkaebi from '../../assets/illust/mukkaebi.svg';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatScore, joinDot } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { ReviewForm } from './ReviewForm';
import {
  aspectsOf,
  detailScoresOf,
  EMPTY_FORM,
  photoKeysOf,
  type ReviewFormValue,
  type RewardState,
} from './reviewValue';
import styles from './Review.module.css';

async function loadWrite(visitId: number) {
  const visit = await getVerification(visitId);
  const [review, aspects] = await Promise.all([
    visit.reviewId ? getReview(visit.reviewId) : null,
    getReviewAspects(),
  ]);
  return { review, aspects: aspects.items };
}

/** 세부평가 남기기 /visits/:visitId/review (REVIEW-02, 맛 별점 다음 · 선택) */
export function ReviewWritePage() {
  const visitId = Number(useParams().visitId);
  const { data, error, reload } = useAsync(() => loadWrite(visitId), [visitId]);

  if (error) {
    return (
      <Screen>
        <AppHeader title="세부평가 남기기" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="세부평가 남기기" />
        <Loading />
      </Screen>
    );
  }
  // 맛 별점 전이면 별점부터
  if (!data.review) return <Navigate to={`/visits/${visitId}/rating`} replace />;
  // 세부평가는 한 번만 — 이미 남겼으면 수정 화면으로
  const r = data.review;
  if (r.detailScores || r.content || r.imageCount > 0 || r.aspects.length > 0) {
    return <Navigate to={`/reviews/${r.reviewId}/edit`} replace />;
  }
  return <WriteForm visitId={visitId} review={r} aspects={data.aspects} />;
}

function WriteForm({
  visitId,
  review,
  aspects,
}: {
  visitId: number;
  review: Review;
  aspects: { aspectId: number; name: string }[];
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [value, setValue] = useState<ReviewFormValue>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const scores = detailScoresOf(value);
  const content = value.content.trim();
  const empty =
    scores === null && !content && value.photos.length === 0 && aspectsOf(value).length === 0;

  const submit = async () => {
    if (scores === 'PARTIAL' || empty) return;
    setSaving(true);
    try {
      const imageKeys = await photoKeysOf(value.photos);
      const result = await addReviewDetail(visitId, {
        detailScores: scores ?? undefined,
        aspects: aspectsOf(value),
        content: content || undefined,
        imageKeys: imageKeys.length > 0 ? imageKeys : undefined,
      });
      const state: RewardState = {
        restaurantName: review.restaurant.name,
        point: result.rewards.point,
        parts: { scores: scores !== null, content: Boolean(content), photos: imageKeys.length > 0 },
      };
      navigate(`/visits/${visitId}/reward`, { replace: true, state });
    } catch (err) {
      toast(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          {scores === 'PARTIAL' && (
            <p className={styles.hint}>세부 별점은 네 항목을 모두 골라 주세요</p>
          )}
          <Button onClick={submit} disabled={empty || scores === 'PARTIAL' || saving}>
            등록하고 포인트 적립
          </Button>
        </>
      }
    >
      <AppHeader title="세부평가 남기기" />
      <div className={styles.content}>
        <div className={styles.headCenter}>
          <span className={styles.heroSmall} aria-hidden="true">
            <img src={mukkaebi} alt="" />
          </span>
          <span className={styles.chip}>세부평가 · 선택</span>
          <h2 className={styles.headTitle}>맛 말고 다른 점도 알려주세요</h2>
          <p className={styles.headSub}>
            {joinDot([
              review.restaurant.name,
              [review.restaurant.dongName, review.restaurant.categoryName]
                .filter(Boolean)
                .join(' '),
              `맛 ★ ${formatScore(review.overallScore)}`,
            ])}
          </p>
        </div>
        <ReviewForm value={value} onChange={setValue} aspectOptions={aspects} />
      </div>
    </Screen>
  );
}
