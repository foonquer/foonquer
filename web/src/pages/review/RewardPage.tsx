import { Navigate, useLocation, useNavigate } from 'react-router';
import { getMyPoints } from '../../api/points';
import mukkaebi from '../../assets/illust/mukkaebi.svg';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { formatPoint } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import flow from '../visit/Flow.module.css';
import type { RewardState } from './reviewValue';

/** 포인트 적립 완료 /visits/:visitId/reward — 세부평가(REVIEW-02) 결과를 이전 화면에서 받는다 */
export function RewardPage() {
  const state = useLocation().state as RewardState | null;
  const navigate = useNavigate();
  const { data: points } = useAsync(() => getMyPoints(), []);
  if (!state) return <Navigate to="/me/reviews" replace />;

  const rows = [
    { label: '세부 별점 4개 항목', done: state.parts.scores, point: 20 },
    { label: '세부 리뷰 작성', done: state.parts.content, point: 30 },
    ...(state.parts.photos ? [{ label: '사진 첨부', done: true, point: 20 }] : []),
  ];
  const home = () => navigate('/', { replace: true });

  return (
    <Screen
      footer={
        <>
          <Button onClick={() => navigate('/me/mukkaebi')}>먹포인트로 꾸미러 가기</Button>
          <Button variant="white" onClick={home}>
            홈으로
          </Button>
        </>
      }
    >
      <AppHeader title="적립 완료" onBack={home} />
      <div className={flow.content}>
        <div className={flow.center}>
          <img src={mukkaebi} alt="" className={flow.mukkaebi} />
          <h2 className={flow.title}>먹포인트 +{formatPoint(state.point)} 받았어요!</h2>
          <p className={flow.subtitle}>{state.restaurantName} 세부평가 등록 완료</p>
        </div>
        <section className={flow.card} aria-label="적립 내역">
          <p className={flow.sectionLabel}>적립 내역</p>
          <div className={flow.rows}>
            {rows.map((r) => (
              <p key={r.label} className={flow.row}>
                <span>{r.label}</span>
                <strong>{r.done ? `+${formatPoint(r.point)}` : '작성 안 함'}</strong>
              </p>
            ))}
          </div>
          <p className={flow.total}>
            <span>이번에 받은 먹포인트</span>
            <strong>+{formatPoint(state.point)}</strong>
          </p>
          {points && (
            <p className={flow.balance}>
              <span>내 먹포인트</span>
              <strong>
                {formatPoint(points.pointBalance - state.point)} →{' '}
                {formatPoint(points.pointBalance)}
              </strong>
            </p>
          )}
        </section>
        {!state.parts.content && (
          <p className={flow.subtitle}>다음에는 글 리뷰도 남겨 보세요 · 글 리뷰 +30P</p>
        )}
      </div>
    </Screen>
  );
}
