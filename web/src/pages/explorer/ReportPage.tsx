import { useId, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { report, REPORT_REASONS, type ReportReason } from '../../api/profile';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import styles from './Report.module.css';

/** 자세한 내용 최대 길이 (서버 REPORT-01과 같다) */
const DETAIL_MAX = 200;

/**
 * 신고하기 /users/:userId/report · /reviews/:reviewId/report (REPORT-01).
 * 누구를 신고하는지는 앞 화면이 state.name으로 넘긴다
 */
export function ReportPage() {
  const params = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const name = (useLocation().state as { name?: string } | null)?.name ?? '이 탐험가';
  const isReview = params.reviewId !== undefined;
  const targetId = Number(isReview ? params.reviewId : params.userId);
  const detailId = useId();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!reason) return;
    setSending(true);
    try {
      const { message } = await report({
        targetType: isReview ? 'REVIEW' : 'MEMBER',
        targetId,
        reason,
        detail: detail.trim() || null,
      });
      toast({ message: message.replace(/\.$/, ''), check: true });
      navigate(-1);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          <p className={styles.caption}>허위 신고가 반복되면 이용이 제한될 수 있어요</p>
          <Button className={styles.submit} onClick={send} disabled={!reason || sending}>
            신고 접수하기
          </Button>
        </>
      }
    >
      <AppHeader title="신고하기" />
      <div className={styles.content}>
        <h2 className={styles.title}>어떤 문제가 있나요?</h2>
        <p className={styles.sub}>
          {isReview ? `${name}님의 리뷰를` : `${name}님을`} 신고하는 이유를 골라 주세요.
          <br />
          신고한 사실은 상대방에게 알리지 않아요.
        </p>
        <fieldset className={styles.reasons}>
          <legend className={styles.srOnly}>신고 이유</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className={styles.reason}>
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
              />
              {r.label}
            </label>
          ))}
        </fieldset>
        <label htmlFor={detailId} className={styles.label}>
          자세한 내용 (선택)
        </label>
        <div className={styles.box}>
          <textarea
            id={detailId}
            className={styles.textarea}
            placeholder="예: 리뷰가 실제 메뉴와 다른 내용이에요"
            maxLength={DETAIL_MAX}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
          <span className={styles.counter}>
            {detail.length} / {DETAIL_MAX}
          </span>
        </div>
      </div>
    </Screen>
  );
}
