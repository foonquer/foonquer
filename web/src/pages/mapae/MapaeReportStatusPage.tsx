import { useLocation, useParams } from 'react-router';
import {
  getMapaeReport,
  MAPAE_EVENT_TYPES,
  MAPAE_REPORT_POINT,
  type MapaeReport,
} from '../../api/mapae';
import { AppHeader } from '../../components/AppHeader';
import { ButtonLink } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { formatDistance } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import styles from './Mapae.module.css';

/**
 * 마패 제보 접수 /mapae-reports/:reportId (피그마 ⑥). 제보 화면은 방금 받은 결과를 state로 넘기고,
 * 새로 열면(알림·새로고침) MAPAE-02로 지금 현황을 다시 받는다
 */
export function MapaeReportStatusPage() {
  const reportId = Number(useParams().reportId);
  const passed = (useLocation().state as { report?: MapaeReport } | null)?.report;
  const fetched = useAsync(
    () => (passed ? Promise.resolve(passed) : getMapaeReport(reportId)),
    [reportId],
  );
  const report = fetched.data;
  return (
    <Screen
      footer={
        report && (
          <ButtonLink to={`/restaurants/${report.restaurantId}`}>가게로 돌아가기</ButtonLink>
        )
      }
    >
      <AppHeader title="리뷰 이벤트 제보" />
      {fetched.error ? (
        <EmptyState title={errorMessage(fetched.error)} onRetry={fetched.reload} />
      ) : !report ? (
        <Loading />
      ) : (
        <ReportStatus report={report} />
      )}
    </Screen>
  );
}

function ReportStatus({ report: r }: { report: MapaeReport }) {
  const confirmed = r.status === 'CONFIRMED';
  const enough = r.reporterCount >= r.reportersNeeded;
  const left = Math.max(0, r.reportersNeeded - r.reporterCount);
  const type = MAPAE_EVENT_TYPES.find((t) => t.value === r.eventType)?.label ?? r.eventType;
  return (
    <div className={styles.content}>
      <div className={styles.received}>
        <span className={styles.receivedIcon} aria-hidden="true">
          ✓
        </span>
        <h2 className={styles.title}>
          {confirmed
            ? '마패가 붙었어요'
            : r.status === 'REJECTED'
              ? '반려된 제보예요'
              : '제보가 접수됐어요'}
        </h2>
        <p className={styles.sub}>
          {r.restaurantName} · {type}
        </p>
      </div>

      <ol className={styles.steps} aria-label="처리 단계">
        <li data-state="done">
          <span className={styles.stepNo}>1</span>
          <span>
            <strong>위치 확인</strong>
            <span className={styles.stepText}>
              가게에서 {formatDistance(r.distanceM)} · 확인 완료
            </span>
          </span>
        </li>
        <li data-state={enough ? 'done' : 'now'}>
          <span className={styles.stepNo}>2</span>
          <span>
            <strong>방문자 제보 {r.reportersNeeded}건 이상</strong>
            <span className={styles.stepText}>
              {enough
                ? `서로 다른 방문자 제보 ${r.reporterCount}건이 모였어요`
                : `지금 ${r.reporterCount}건 · ${left}건 더 필요해요`}
            </span>
          </span>
        </li>
        <li data-state={confirmed ? 'done' : 'wait'}>
          <span className={styles.stepNo}>3</span>
          <span>
            <strong>마패 표시</strong>
            <span className={styles.stepText}>
              {confirmed ? '가게 상세에 마패가 붙었어요' : '제보가 모이면 가게에 마패가 붙어요'}
            </span>
          </span>
        </li>
      </ol>

      <p className={styles.reward} data-done={confirmed && r.rewardPoint > 0}>
        {confirmed && r.rewardPoint > 0
          ? `제보 보상 +${r.rewardPoint}P를 받았어요`
          : `마패가 확정되면 제보자에게 +${MAPAE_REPORT_POINT}P`}
      </p>
    </div>
  );
}
