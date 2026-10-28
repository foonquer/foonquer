import { Link, useNavigate, useParams } from 'react-router';
import { getRestaurant, type RestaurantDetail } from '../../api/restaurants';
import mealHero from '../../assets/illust/meal-hero.svg';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { ConquestBadge } from '../../components/ConquestBadge';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { formatDistance, formatScore, joinDot } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { useMyCoords } from '../../lib/useMyCoords';
import { businessLine } from './business';
import styles from './RestaurantDetailPage.module.css';

/** 음식점 상세 /restaurants/:restaurantId (REST-01) */
export function RestaurantDetailPage() {
  const { restaurantId } = useParams();
  const id = Number(restaurantId);
  const { coords, ready } = useMyCoords();
  const { data, error, reload } = useAsync(
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
  return <Detail r={data} />;
}

const SCORE_ITEMS = [
  { key: 'taste', label: '맛' },
  { key: 'cleanliness', label: '청결' },
  { key: 'portion', label: '양' },
  { key: 'service', label: '서비스' },
  { key: 'price', label: '가격' },
] as const;

function Detail({ r }: { r: RestaurantDetail }) {
  const navigate = useNavigate();
  const toast = useToast();
  const score = formatScore(r.rating.score);
  const myScore = formatScore(r.my.myScore);
  const closed = r.status === 'C';
  const percent = (v: number | null) => (v === null ? '–' : `${v}%`);

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
            onClick={() => toast('저장하기는 곧 쓸 수 있어요')}
          >
            {r.my.isSaved ? '저장됨' : '저장하기'}
          </Button>
          {mainAction}
        </div>
      }
    >
      <AppHeader title="음식점 상세" />
      <div className={styles.content}>
        <img src={mealHero} alt="" className={styles.hero} />

        <div className={styles.titleRow}>
          <h2 className={styles.name}>{r.name}</h2>
          <ConquestBadge state={r.my.conquestState} size="md" />
        </div>
        <div className={styles.ratingRow}>
          <p className={styles.rating}>
            {score ? (
              <>
                <span className={styles.star}>★</span> {score}
                <span className={styles.gap} />
                인증 평가 {r.rating.reviewCount}
              </>
            ) : (
              '아직 인증 평가가 없어요'
            )}
          </p>
          {r.my.conquestState === 'CONQUERED' && myScore && (
            <p className={styles.myScore}>내 평가 ★ {myScore}</p>
          )}
        </div>
        <p className={styles.meta}>
          {joinDot([
            r.categoryName,
            r.distanceM !== null ? `현재 위치에서 ${formatDistance(r.distanceM)}` : null,
          ])}
        </p>

        <section className={styles.infoCard} aria-label="가게 정보">
          <p className={styles.address}>
            {joinDot([
              [r.sigunguName, r.dongName].filter(Boolean).join(' '),
              r.roadAddress ?? r.jibunAddress,
            ])}
          </p>
          <p className={styles.hours} data-closed={closed}>
            {closed ? '폐업한 가게예요' : businessLine(r.businessStatus)}
          </p>
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

        <section className={styles.statsCard} aria-label="항목별 평가">
          <div className={styles.statsHead}>
            <p>항목별 평균 · 인증 평가 {r.rating.reviewCount}개</p>
            <p className={styles.visitRates}>
              현지인 방문 {percent(r.stats.localVisitRate)} · 재방문 {percent(r.stats.revisitRate)}
            </p>
          </div>
          <div className={styles.scores}>
            {SCORE_ITEMS.map((item) => (
              <div key={item.key} className={styles.score}>
                <span className={styles.value}>{formatScore(r.stats[item.key]) ?? '–'}</span>
                <span className={styles.label}>{item.label}</span>
              </div>
            ))}
            <div className={styles.score} data-highlight="true">
              <span className={styles.value}>{percent(r.stats.revisitIntentRate)}</span>
              <span className={styles.label}>재방문 의사</span>
            </div>
          </div>
        </section>

        <div className={styles.reviewHead}>
          <h3>방문 인증 리뷰</h3>
          <Link to={`/restaurants/${r.restaurantId}/reviews`}>
            전체 {r.rating.reviewCount}개 보기 ›
          </Link>
        </div>
        <p className={styles.reviewNote}>
          {r.rating.reviewCount > 0
            ? '방문 인증한 사람들의 리뷰를 전체 보기에서 볼 수 있어요.'
            : '아직 인증 리뷰가 없어요. 방문 인증하고 첫 리뷰를 남겨 보세요.'}
        </p>
      </div>
    </Screen>
  );
}
