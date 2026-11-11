import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { getRestaurantPreview, type RestaurantPreview } from '../../api/restaurants';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { ConquestBadge } from '../../components/ConquestBadge';
import { FoodImage } from '../../components/FoodImage';
import { Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatDate, formatDistance, formatScore, joinDot } from '../../lib/format';
import type { Coords } from '../../lib/geolocation';
import { euro } from '../../lib/korean';
import { useAsync } from '../../lib/useAsync';
import { businessText } from '../restaurant/business';
import styles from './PreviewSheet.module.css';

type Props = {
  restaurantId: number | null;
  coords: Coords | null;
  onClose: () => void;
};

/** 지도 핀을 누르면 뜨는 가게 미리보기 (MAP-02) */
export function PreviewSheet({ restaurantId, coords, onClose }: Props) {
  return (
    <BottomSheet open={restaurantId !== null} onClose={onClose} label="가게 미리보기" dim="light">
      {restaurantId !== null && (
        <PreviewBody restaurantId={restaurantId} coords={coords} onClose={onClose} />
      )}
    </BottomSheet>
  );
}

function PreviewBody({ restaurantId, coords, onClose }: Props & { restaurantId: number }) {
  const toast = useToast();
  const { data, error } = useAsync(
    () => getRestaurantPreview(restaurantId, coords),
    [restaurantId, coords?.lat, coords?.lng],
  );

  useEffect(() => {
    if (!error) return;
    toast(errorMessage(error));
    onClose();
  }, [error, toast, onClose]);

  if (!data) {
    return (
      <div className={styles.loading}>
        <Loading label="가게 정보를 불러오는 중" />
      </div>
    );
  }
  return <Preview p={data} />;
}

function Preview({ p }: { p: RestaurantPreview }) {
  const navigate = useNavigate();
  const score = formatScore(p.rating.score);
  const detail = () => navigate(`/restaurants/${p.restaurantId}`);

  return (
    <div className={styles.body}>
      <div className={styles.head}>
        <span className={styles.thumb}>
          <FoodImage imageUrl={p.imageUrl} categoryName={p.categoryName} />
        </span>
        <div className={styles.info}>
          <div className={styles.titleRow}>
            <h2 className={styles.name}>{p.name}</h2>
            <ConquestBadge state={p.conquestState} size="md" />
          </div>
          <p className={styles.rating}>
            {score ? (
              <>
                <span className={styles.star}>★</span> {score} 맛
                {p.myOverallScore !== null && ` · 내 종합 ${formatScore(p.myOverallScore)}`} · 인증
                평가 {p.rating.reviewCount}
              </>
            ) : (
              '아직 별점이 없어요'
            )}
          </p>
          <p className={styles.meta}>
            {joinDot([p.categoryName, formatDistance(p.distanceM), businessText(p.businessStatus)])}
          </p>
        </div>
      </div>

      <Summary p={p} />

      <div className={styles.buttons}>
        {p.conquestState === 'CONQUERED' ? (
          <>
            <Button
              variant="soft"
              size="md"
              disabled={!p.myConquest?.reviewId}
              onClick={() => navigate(`/reviews/${p.myConquest?.reviewId}`)}
            >
              내 리뷰 보기
            </Button>
            <Button size="md" onClick={detail}>
              상세 보기
            </Button>
          </>
        ) : p.conquestState === 'MOVING' && p.moving ? (
          <>
            <Button variant="soft" size="md" onClick={detail}>
              상세 보기
            </Button>
            <Button size="md" onClick={() => navigate(`/visits/${p.moving?.visitId}/follow`)}>
              먹깨비 따라가기
            </Button>
          </>
        ) : (
          <>
            <Button variant="soft" size="md" onClick={detail}>
              상세 보기
            </Button>
            <Button
              size="md"
              onClick={() => navigate(`/visits/new?restaurantId=${p.restaurantId}`)}
            >
              방문 인증
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** 회색 요약 상자: 내 정복 기록 / 먹깨비 이동 중 / 이번 시즌 정복한 사람 수 */
function Summary({ p }: { p: RestaurantPreview }) {
  if (p.conquestState === 'CONQUERED' && p.myConquest) {
    const c = p.myConquest;
    const myScore = formatScore(c.myScore);
    return (
      <div className={styles.summary}>
        <p className={styles.summaryTitle}>
          {joinDot([`${formatDate(c.conqueredAt)} 정복`, myScore && `내 별점 ★ ${myScore}`])}
        </p>
        <p className={styles.summaryText}>
          {joinDot([
            c.revisitIntent === null
              ? null
              : c.revisitIntent
                ? '재방문 의사 있음'
                : '재방문 의사 없음',
            c.hasTextReview ? '글 리뷰 작성 완료' : '글 리뷰를 남겨 보세요',
          ])}
        </p>
      </div>
    );
  }
  if (p.conquestState === 'MOVING') {
    return (
      <div className={styles.summary}>
        <p className={styles.summaryTitle}>먹깨비가 {euro(p.name)} 가는 중</p>
        <p className={styles.summaryText}>방문 인증을 마쳤어요. 먹깨비가 도착하면 정복돼요</p>
      </div>
    );
  }
  return (
    <div className={styles.summary}>
      <p className={styles.summaryTitle}>
        {p.currentSeasonConquerorCount > 0
          ? `이번 시즌 ${p.currentSeasonConquerorCount}명이 정복했어요`
          : '이번 시즌 아직 아무도 정복하지 않았어요'}
      </p>
      <p className={styles.summaryText}>
        {p.conqueredInPastSeason
          ? '지난 시즌에 정복했던 곳이에요. 다시 정복해 보세요'
          : '방문 인증하면 이 가게를 정복할 수 있어요'}
      </p>
    </div>
  );
}
