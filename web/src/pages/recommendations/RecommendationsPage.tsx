import { useRef, useState, type PointerEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { getRecommendations, type RecommendationItem } from '../../api/restaurants';
import mealReco from '../../assets/illust/meal-reco.svg';
import { AppHeader } from '../../components/AppHeader';
import { ButtonLink } from '../../components/Button';
import { FilterChips } from '../../components/Chips';
import { RegionChip } from '../../components/RegionChip';
import { RegionSelectSheet } from '../../components/RegionSelectSheet';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { formatDistance, formatScore, joinDot } from '../../lib/format';
import { useViewRegion } from '../../lib/region';
import { useAsync } from '../../lib/useAsync';
import { useMyCoords } from '../../lib/useMyCoords';
import { parseRecoType, RECO_EMPTY, RECO_OPTIONS, RECO_REASON } from './recoTypes';
import styles from './Recommendations.module.css';

/** 카드로 넘겨 보는 추천 수 */
const CAROUSEL_SIZE = 5;
const SWIPE_PX = 40;

/** 추천맛집 탭: 지금 동네의 추천 맛집 5곳을 카드로 넘겨 본다 (RECO-01) */
export function RecommendationsPage() {
  const [params, setParams] = useSearchParams();
  const type = parseRecoType(params.get('type'));
  const { region, error: regionError, retry } = useViewRegion();
  const { coords, ready } = useMyCoords();
  const [regionOpen, setRegionOpen] = useState(false);
  const reco = useAsync(
    () =>
      region && ready
        ? getRecommendations({
            type,
            regionId: region.regionId,
            lat: coords?.lat,
            lng: coords?.lng,
            size: CAROUSEL_SIZE,
          })
        : new Promise<never>(() => {}),
    [type, region?.regionId, ready, coords?.lat, coords?.lng],
  );

  const items = reco.data?.items ?? [];

  return (
    <Screen
      inTab
      footer={
        items.length > 0 ? (
          <ButtonLink to={`/recommendations/list?type=${type}`}>추천 맛집 더 보기</ButtonLink>
        ) : undefined
      }
    >
      <AppHeader title="추천맛집" />
      <div className={styles.content}>
        <RegionChip region={region} onClick={() => setRegionOpen(true)} />
        <h2 className={styles.title}>이 동네의 다음 한 끼</h2>
        <p className={styles.subtitle}>현지인 방문·재방문·인증 리뷰를 바탕으로 골랐어요.</p>
        <div className={styles.chips}>
          <FilterChips
            label="추천 기준"
            options={RECO_OPTIONS}
            value={type}
            onChange={(next) =>
              setParams(next === 'LOCAL_POPULAR' ? {} : { type: next }, { replace: true })
            }
          />
        </div>

        {regionError ? (
          <EmptyState title="내 동네를 불러오지 못했어요" onRetry={retry} />
        ) : reco.error ? (
          <EmptyState title={errorMessage(reco.error)} onRetry={reco.reload} />
        ) : !reco.data ? (
          <Loading label="추천 맛집을 불러오는 중" />
        ) : items.length === 0 ? (
          <EmptyState title="아직 추천할 맛집이 없어요" description={RECO_EMPTY[type]} />
        ) : (
          <Carousel key={`${type}-${region?.regionId}`} items={items} reason={RECO_REASON[type]} />
        )}
      </div>
      <RegionSelectSheet open={regionOpen} onClose={() => setRegionOpen(false)} />
    </Screen>
  );
}

function Carousel({ items, reason }: { items: RecommendationItem[]; reason: string }) {
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);

  const onPointerDown = (e: PointerEvent) => {
    startX.current = e.clientX;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (dx < -SWIPE_PX) setIndex((i) => Math.min(i + 1, items.length - 1));
    if (dx > SWIPE_PX) setIndex((i) => Math.max(i - 1, 0));
  };

  return (
    <section className={styles.carousel} aria-roledescription="carousel" aria-label="추천 맛집">
      <div className={styles.viewport} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <div className={styles.track} style={{ transform: `translateX(-${index * 100}%)` }}>
          {items.map((item, i) => (
            <div
              key={item.restaurantId}
              className={styles.slide}
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${items.length}`}
              aria-hidden={i !== index}
            >
              <img src={mealReco} alt="" className={styles.illust} draggable={false} />
              <RecoCard item={item} reason={reason} focusable={i === index} />
            </div>
          ))}
        </div>
      </div>
      {items.length > 1 && (
        <div className={styles.dots}>
          {items.map((item, i) => (
            <button
              key={item.restaurantId}
              type="button"
              className={styles.dot}
              data-active={i === index}
              aria-label={`${i + 1}번째 추천 보기`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RecoCard({
  item,
  reason,
  focusable,
}: {
  item: RecommendationItem;
  reason: string;
  focusable: boolean;
}) {
  const score = formatScore(item.rating.score);
  return (
    <Link
      to={`/restaurants/${item.restaurantId}`}
      className={styles.card}
      tabIndex={focusable ? undefined : -1}
    >
      <span className={styles.reason}>{reason}</span>
      <span className={styles.name}>{item.name}</span>
      <span className={styles.meta}>
        {joinDot([
          score ? `★ ${score}` : null,
          `인증 리뷰 ${item.rating.reviewCount}`,
          item.categoryName,
          formatDistance(item.distanceM),
        ])}
      </span>
      <span className={styles.rates}>
        {joinDot([
          item.localVisitRate !== null ? `현지 주민 방문 ${item.localVisitRate}%` : null,
          item.revisitRate !== null ? `재방문 ${item.revisitRate}%` : null,
          '방문 인증',
        ])}
      </span>
    </Link>
  );
}
