import { useId, useState } from 'react';
import { getWithdrawalSummary, withdraw } from '../../api/users';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatPoint } from '../../lib/format';
import { signOut } from '../../lib/session';
import { useAsync } from '../../lib/useAsync';
import styles from './Withdraw.module.css';

/** 기타 이유 최대 길이 (서버 SET-04와 같다) */
const DETAIL_MAX = 255;

/** 회원 탈퇴 /me/withdraw (SET-03·04) — 사라지는 기록을 보여 주고, 확인을 받은 뒤 탈퇴 */
export function WithdrawPage() {
  const toast = useToast();
  const detailId = useId();
  const { data, error, reload } = useAsync(getWithdrawalSummary, []);
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  if (error) {
    return (
      <Screen>
        <AppHeader title="회원 탈퇴" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="회원 탈퇴" />
        <Loading />
      </Screen>
    );
  }

  const leave = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await withdraw({
        confirmed: true,
        reasonCode: reason,
        reasonDetail: reason === 'ETC' ? detail.trim() || null : null,
      });
      toast('탈퇴했어요. 그동안 함께해 주셔서 고마워요.');
      signOut(); // 라우트 가드가 로그인 화면으로 보낸다
    } catch (err) {
      // 확인창을 닫아도 보이게 탈퇴 버튼 위에 남긴다 (다시 누르거나 이유를 바꾸면 지운다)
      setFailed(errorMessage(err));
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  const rows = [
    {
      label: '정복 기록',
      value: `${data.conquest.restaurantCount}곳 · ${data.conquest.sigunguCount}개 구`,
    },
    { label: '먹포인트', value: formatPoint(data.pointBalance) },
    {
      label: '먹깨비와 아이템',
      value: `LV.${data.mukkaebi.level} · 아이템 ${data.mukkaebi.itemCount}개`,
    },
    { label: '칭호', value: `${data.titleCount}개` },
  ];
  return (
    <Screen
      footer={
        <>
          {failed && (
            <p className={styles.error} role="alert">
              {failed}
            </p>
          )}
          <Button onClick={() => setConfirmOpen(true)} disabled={!agreed}>
            탈퇴하기
          </Button>
        </>
      }
    >
      <AppHeader title="회원 탈퇴" />
      <div className={styles.content}>
        <h2 className={styles.title}>정말 떠나시나요?</h2>
        <p className={styles.sub}>탈퇴하면 아래 기록이 사라지고 되돌릴 수 없어요</p>
        <dl className={styles.card}>
          {rows.map((r) => (
            <div key={r.label} className={styles.row}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
          <div className={styles.row}>
            <dt>작성한 리뷰 {data.reviewCount}개</dt>
            <dd className={styles.keep}>‘탈퇴한 탐험가’로 남아요</dd>
          </div>
        </dl>

        <fieldset className={styles.reasons}>
          <legend className={styles.legend}>떠나는 이유를 알려 주세요 (선택)</legend>
          {data.reasonOptions.map((o) => (
            <label key={o.code} className={styles.reason}>
              <input
                type="radio"
                name="reason"
                value={o.code}
                checked={reason === o.code}
                onChange={() => {
                  setReason(o.code);
                  setFailed(null);
                }}
              />
              {o.label}
            </label>
          ))}
          {reason === 'ETC' && (
            <>
              <label htmlFor={detailId} className={styles.srOnly}>
                기타 이유
              </label>
              <textarea
                id={detailId}
                className={styles.textarea}
                placeholder="더 나은 먹장깨기를 위해 알려 주세요"
                maxLength={DETAIL_MAX}
                value={detail}
                onChange={(e) => {
                  setDetail(e.target.value);
                  setFailed(null);
                }}
              />
            </>
          )}
        </fieldset>

        <label className={styles.agree}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          안내를 모두 확인했어요
        </label>
      </div>
      <Dialog
        open={confirmOpen}
        title="마지막으로 확인할게요"
        description={[
          `${data.nickname ?? '탐험가'}님의 정복 기록·먹깨비·먹포인트가 모두 사라져요.`,
        ]}
        confirmLabel={busy ? '탈퇴하는 중…' : '탈퇴'}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={leave}
        busy={busy}
      />
    </Screen>
  );
}
