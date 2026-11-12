import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { getRestaurant, type RestaurantDetail } from '../../api/restaurants';
import { getRestaurantReviews } from '../../api/reviews';
import { saveRestaurant, unsaveRestaurant } from '../../api/saved';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { ConquestBadge } from '../../components/ConquestBadge';
import { FoodImage } from '../../components/FoodImage';
import { ReviewCard } from '../../components/ReviewCard';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { TasteCriteriaSheet } from '../../components/TasteSheets';
import { useToast } from '../../components/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { formatDistance, formatScore, joinDot, noRatingText } from '../../lib/format';
import { eunNeun } from '../../lib/korean';
import { scoreBand, tasteCriterion } from '../../lib/taste';
import { useAsync } from '../../lib/useAsync';
import { useMyCoords } from '../../lib/useMyCoords';
import { businessLine } from './business';
import {
  FitSheet,
  type SituationContext,
  SituationReasonCard,
} from '../recommendations/SituationParts';

/**
 * "가양동 · 강서구 양천로49길 20". 주소 앞의 "서울특별시"를 빼고, 주소에 구 이름이 있으면 동만 앞에 둔다
 * (예전: "강서구 가양동 · 서울특별시 강서구 양천로49길 20")
 */
function addressLine(r: {
  sigunguName: string | null;
  dongName: string | null;
  roadAddress: string | null;
  jibunAddress: string | null;
}) {
  const address = (r.roadAddress ?? r.jibunAddress)?.replace(/^서울(특별시)?\s+/, '') ?? null;
  const area =
    address && r.sigunguName && address.startsWith(r.sigunguName)
      ? r.dongName
      : [r.sigunguName, r.dongName].filter(Boolean).join(' ');
  return joinDot([area, address]);
}
import { ScoreStats } from './ScoreStats';
import styles from './RestaurantDetailPage.module.css';

/** 음식점 상세 /restaurants/:restaurantId (REST-01) */
export function RestaurantDetailPage() {
  const { restaurantId } = useParams();
  const id = Number(restaurantId);
  const { coords, ready } = useMyCoords();
  const { data, error, reload, mutate } = useAsync(
    // 위치를 물어보는 동안 기다렸다가 거리까지 받는다
    () => (ready ? getRestaurant(id, coords) : new Promise<never>(() => {})),
    [id, ready, coords?.lat, coords?.lng],
  );

  if (!Number.isInteger(id) || id <= 0 || (error instanceof ApiError && error.status === 404)) {
    return (
      <Screen>
        <AppHeader title="음식점 상세" />
        <EmptyState title="가게를 찾을 수 없어요" description="없어졌거나 주소가 잘못됐어요." />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen>
        <AppHeader title="음식점 상세" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="음식점 상세" />
        <Loading label="음식점 정보를 불러오는 중" />
      </Screen>
    );
  }
  return (
    <Detail
      r={data}
      onSavedChange={(isSaved) => mutate((prev) => ({ ...prev, my: { ...prev.my, isSaved } }))}
    />
  );
}

function Detail({
  r,
  onSavedChange,
}: {
  r: RestaurantDetail;
  onSavedChange: (isSaved: boolean) => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // 상황 맞춤 결과에서 열었으면 "…에 맞는 이유" 카드 (피그마 3-4 ⑦)
  const situation = (useLocation().state as { situation?: SituationContext } | null)?.situation;
  const [fitOpen, setFitOpen] = useState(false);
  const { data: reviews, mutate: mutateReviews } = useAsync(
    () => getRestaurantReviews(r.restaurantId, { sort: 'HELPFUL', size: 2 }),
    [r.restaurantId],
  );
  const score = formatScore(r.rating.score);
  const myScore = formatScore(r.my.myScore);
  const closed = r.status === 'C';
  const hours = businessLine(r.businessStatus);

  const toggleSave = async () => {
    setSaving(true);
    try {
      if (r.my.isSaved) {
        await unsaveRestaurant(r.restaurantId);
        onSavedChange(false);
        toast('저장을 취소했어요');
      } else {
        await saveRestaurant(r.restaurantId);
        onSavedChange(true);
        toast({
          message: '가고 싶은 곳에 저장했어요',
          check: true,
          action: { label: '리스트 보기', to: '/list' },
        });
      }
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const mainAction =
    r.my.conquestState === 'MOVING' && r.my.movingVisitId ? (
      <Button size="md" onClick={() => navigate(`/visits/${r.my.movingVisitId}/follow`)}>
        먹깨비 따라가기
      </Button>
    ) : r.my.conquestState === 'CONQUERED' && r.my.myReviewId ? (
      <Button size="md" onClick={() => navigate(`/reviews/${r.my.myReviewId}`)}>
        내 리뷰 보기
      </Button>
    ) : (
      <Button
        size="md"
        disabled={closed}
        onClick={() => navigate(`/visits/new?restaurantId=${r.restaurantId}`)}
      >
        방문 인증
      </Button>
    );

  return (
    <Screen
      footer={
        <div className={styles.footer}>
          <Button
            variant="white"
            size="md"
            aria-pressed={r.my.isSaved}
            disabled={saving}
            onClick={toggleSave}
          >
            {r.my.isSaved ? '저장됨' : '저장하기'}
          </Button>
          {mainAction}
        </div>
      }
    >
      <AppHeader title="음식점 상세" />
      <div className={styles.content}>
        <FoodImage imageUrl={r.imageUrl} categoryName={r.categoryName} className={styles.hero} />

        <div className={styles.titleRow}>
          <h2 className={styles.name}>{r.name}</h2>
          <ConquestBadge state={r.my.conquestState} size="md" />
        </div>
        <div className={styles.ratingRow}>
          <p className={styles.rating}>
            {score ? (
              <>
                <span className={styles.star}>★</span> {score}
                <span className={styles.tasteLabel}>맛 별점</span>
                <span className={styles.gap} />
                <span className={styles.reviewCount}>인증 평가 {r.rating.reviewCount}</span>
              </>
            ) : (
              noRatingText(r.rating.reviewCount)
            )}
          </p>
          {r.my.conquestState === 'CONQUERED' && myScore && (
            <p className={styles.myScore}>내 평가 ★ {myScore}</p>
          )}
        </div>
        {r.rating.score !== null && (
          <button type="button" className={styles.criteria} onClick={() => setCriteriaOpen(true)}>
            <span className={styles.band}>{scoreBand(r.rating.score)}</span>
            <span>{tasteCriterion(r.rating.score).text}</span>
            <span className={styles.criteriaLink}>기준표 ›</span>
          </button>
        )}
        {situation && (
          <SituationReasonCard context={situation} onOpenFit={() => setFitOpen(true)} />
        )}
        <p className={styles.meta}>
          {joinDot([
            r.categoryName,
            r.distanceM !== null ? `현재 위치에서 ${formatDistance(r.distanceM)}` : null,
          ])}
        </p>

        {r.hasMapae && (
          <section className={styles.mapae} aria-label="마패">
            <span className={styles.mapaeIcon} aria-hidden="true">
              마패
            </span>
            <div>
              <p className={styles.mapaeTitle}>리뷰 이벤트를 하는 가게입니다</p>
              <p className={styles.mapaeSub}>뒷광고 또는 리뷰 이벤트가 확인된 가게예요</p>
            </div>
          </section>
        )}

        <section className={styles.infoCard} aria-label="가게 정보">
          <p className={styles.address}>{addressLine(r)}</p>
          {(closed || hours) && (
            <p className={styles.hours} data-closed={closed}>
              {closed ? '폐업한 가게예요' : hours}
            </p>
          )}
          {(r.phone || r.kakaoPlaceUrl) && (
            <p className={styles.links}>
              {r.phone && <a href={`tel:${r.phone}`}>{r.phone}</a>}
              {r.kakaoPlaceUrl && (
                <a href={r.kakaoPlaceUrl} target="_blank" rel="noopener noreferrer">
                  카카오맵에서 보기 ›
                </a>
              )}
            </p>
          )}
        </section>

        <ScoreStats r={r} />

        <div className={styles.reviewHead}>
          <h3>방문 인증 리뷰</h3>
          <Link to={`/restaurants/${r.restaurantId}/reviews`}>
            전체 {r.rating.reviewCount}개 보기 ›
          </Link>
        </div>
        {reviews && reviews.items.length > 0 ? (
          <div className={styles.reviews}>
            {reviews.items.map((review) => (
              <ReviewCard
                key={review.reviewId}
                review={review}
                onChange={(next) =>
                  mutateReviews((prev) => ({
                    ...prev,
                    items: prev.items.map((i) => (i.reviewId === next.reviewId ? next : i)),
                  }))
                }
              />
            ))}
          </div>
        ) : (
          <p className={styles.reviewNote}>
            {r.rating.reviewCount > 0
              ? '방문 인증한 사람들의 리뷰를 전체 보기에서 볼 수 있어요.'
              : '아직 인증 리뷰가 없어요. 방문 인증하고 첫 리뷰를 남겨 보세요.'}
          </p>
        )}
      </div>
      {situation && (
        <FitSheet
          open={fitOpen}
          onClose={() => setFitOpen(false)}
          name={r.name}
          ratingScore={r.rating.score}
          fitScore={situation.fitScore}
          reasons={situation.reasons}
        />
      )}
      <TasteCriteriaSheet
        open={criteriaOpen}
        onClose={() => setCriteriaOpen(false)}
        score={r.rating.score}
        caption={
          r.rating.score !== null ? `${eunNeun(r.name)} ${scoreBand(r.rating.score)}` : undefined
        }
      />
    </Screen>
  );
}
