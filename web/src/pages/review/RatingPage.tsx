import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { rateVisit } from '../../api/reviews';
import { getVerification } from '../../api/visits';
import mukkaebi from '../../assets/illust/mukkaebi.svg';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { StarInput } from '../../components/StarRating';
import { TasteCriteriaSheet } from '../../components/TasteSheets';
import { useToast } from '../../components/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { joinDot } from '../../lib/format';
import { tasteCriterion } from '../../lib/taste';
import { useAsync } from '../../lib/useAsync';
import styles from './Review.module.css';

/** 별점 남기기 /visits/:visitId/rating — 맛 별점을 고르면 정복 완료 (REVIEW-01) */
export function RatingPage() {
  const visitId = Number(useParams().visitId);
  const navigate = useNavigate();
  const toast = useToast();
  const { data: visit, error, reload } = useAsync(() => getVerification(visitId), [visitId]);
  const [score, setScore] = useState<number | null>(null);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (error) {
    return (
      <Screen>
        <AppHeader title="별점 남기기" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!visit) {
    return (
      <Screen>
        <AppHeader title="별점 남기기" />
        <Loading />
      </Screen>
    );
  }
  // 이미 별점을 남겼으면 내 리뷰로
  if (visit.reviewId) return <Navigate to={`/reviews/${visit.reviewId}`} replace />;
  if (!visit.canRate || !visit.restaurant) {
    return (
      <Screen>
        <AppHeader title="별점 남기기" />
        <EmptyState
          title="아직 별점을 남길 수 없어요"
          description="방문 인증을 마친 뒤에 별점을 남길 수 있어요."
        />
      </Screen>
    );
  }

  const restaurant = visit.restaurant;
  const submit = async () => {
    if (score === null) return;
    setSaving(true);
    try {
      const result = await rateVisit(visitId, score);
      // 모임원과 함께 정복 → 퀘스트 완료(·주간 상자) → 정복 결과 순서로 이어 간다
      const next = result.crew ? 'together' : result.quest ? 'quest' : 'conquered';
      navigate(`/visits/${visitId}/${next}`, {
        replace: true,
        state: result,
      });
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiError && err.code === 'ALREADY_RATED') {
        reload();
        return;
      }
      toast(errorMessage(err));
    }
  };

  return (
    <Screen
      footer={
        <Button onClick={submit} disabled={score === null || saving}>
          이 별점으로 정복하기
        </Button>
      }
    >
      <AppHeader title="별점 남기기" />
      <div className={styles.rating}>
        <span className={styles.hero} aria-hidden="true">
          <img src={mukkaebi} alt="" />
        </span>
        <span className={styles.chip} style={{ marginTop: 28 }}>
          맛 별점
        </span>
        <h2 className={styles.ratingTitle}>음식 맛은 어땠나요?</h2>
        <p className={styles.ratingSub}>{joinDot([restaurant.name, restaurant.categoryName])}</p>
        <div className={styles.stars}>
          <StarInput label="맛 별점" value={score} onChange={setScore} step={0.5} size={42} />
        </div>
        <p className={styles.scoreText} data-empty={score === null} aria-live="polite">
          {score === null
            ? '별을 눌러 평가해 주세요 · 반 개(0.5) 단위로 고를 수 있어요'
            : `${score.toFixed(1)} · ${tasteCriterion(score).text}`}
        </p>
        <button type="button" className={styles.criteriaLink} onClick={() => setCriteriaOpen(true)}>
          맛 기준표 보기 ›
        </button>
      </div>
      <TasteCriteriaSheet
        open={criteriaOpen}
        onClose={() => setCriteriaOpen(false)}
        score={score}
      />
    </Screen>
  );
}
