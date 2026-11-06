import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { getVerification } from '../../api/visits';
import mukkaebi from '../../assets/illust/mukkaebi.svg';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import flow from './Flow.module.css';
import styles from './Visit.module.css';

/** 먹깨비가 가게까지 걸어가는 시간 (CSS 애니메이션과 같다) */
const WALK_MS = 2400;

/**
 * 먹깨비 따라가기 /visits/:visitId/follow — 인증을 마치면 먹깨비가 가게로 이동하고(이동 중),
 * 도착하면 별점을 남겨 정복한다 (피그마 2. 먹깨비 이동 1 출발 → 3 도착)
 */
export function FollowPage() {
  const visitId = Number(useParams().visitId);
  const navigate = useNavigate();
  const { data: v, error, reload } = useAsync(() => getVerification(visitId), [visitId]);
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setArrived(true), WALK_MS);
    return () => clearTimeout(timer);
  }, []);

  if (error) {
    return (
      <Screen>
        <AppHeader title="먹깨비 따라가기" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!v) {
    return (
      <Screen>
        <AppHeader title="먹깨비 따라가기" />
        <Loading />
      </Screen>
    );
  }
  // 이미 정복했거나 아직 인증 전이면 결과 화면이 알맞은 곳으로 보낸다
  if (v.status !== 'VERIFIED') return <Navigate to={`/visits/${visitId}`} replace />;

  const name = v.restaurant?.name ?? '가게';
  return (
    <Screen
      footer={
        <Button
          onClick={() => navigate(`/visits/${visitId}/rating`, { replace: true })}
          disabled={!arrived}
        >
          별점 남기고 정복하기
        </Button>
      }
    >
      <AppHeader title="먹깨비 따라가기" />
      <div className={flow.content}>
        <div className={flow.center}>
          <h2 className={flow.title} aria-live="polite">
            {arrived ? `${name} 도착!` : `${name}까지 이동 중`}
          </h2>
          <p className={flow.subtitle}>
            {arrived
              ? '방문한 맛집을 내 정복 지도에 기록해요'
              : `${v.method === 'RECEIPT' ? '영수증' : '현장'}인증 완료 · 먹깨비가 이동해요`}
          </p>
        </div>
        <div className={styles.road} aria-hidden="true">
          <img src={mukkaebi} alt="" className={styles.walker} data-arrived={arrived} />
          <span className={styles.goal}>{name}</span>
        </div>
        <section className={flow.tip}>
          <p className={flow.tipTitle}>1단계 완료 · 방문 인증</p>
          <p className={flow.tipText}>맛 별점을 남기면 정복이 완료돼요.</p>
        </section>
      </div>
    </Screen>
  );
}
