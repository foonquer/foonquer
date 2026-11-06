import { useState } from 'react';
import { useNavigate } from 'react-router';
import { getLocalRegions, removeLocalRegion, type LocalRegion } from '../../api/users';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { PageTitle } from '../../components/PageTitle';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { eulReul } from '../../lib/korean';
import { useAsync } from '../../lib/useAsync';
import styles from './LocalRegions.module.css';

/** 내 동네 관리 /me/regions (LOCAL-01 목록, LOCAL-03 빼기) */
export function LocalRegionsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const list = useAsync(getLocalRegions, []);
  const [removing, setRemoving] = useState<LocalRegion | null>(null);
  const [busy, setBusy] = useState(false);

  const data = list.data;
  const items = data?.items ?? [];
  const canAdd = !!data && data.canChange && items.length < data.maxCount;
  const canRemove = !!data && data.canChange && items.length > data.minCount;

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const { data: next, message } = await removeLocalRegion(removing.localRegionId);
      list.mutate((prev) => ({ ...prev, ...next }));
      toast(message.replace(/\.$/, ''));
    } catch (err) {
      toast(errorMessage(err));
      list.reload();
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  return (
    <Screen
      footer={
        data && (
          <Button onClick={() => navigate('/me/regions/add')} disabled={!canAdd}>
            + 내 동네 추가
          </Button>
        )
      }
    >
      <AppHeader title="내 동네" />
      {list.error ? (
        <EmptyState title={errorMessage(list.error)} onRetry={list.reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <div className={styles.content}>
          <span className={styles.chip}>
            내 동네 {items.length} / {data.maxCount}
          </span>
          <PageTitle
            className={styles.title}
            title={'자주 가는 동네를\n관리해요'}
            description="고른 동네의 구에서 쓴 리뷰에는 ‘로컬’이 표시돼요"
          />
          <ul className={styles.list}>
            {items.map((r, i) => (
              <li key={r.localRegionId} className={styles.row}>
                <span className={styles.text}>
                  <span className={styles.dong}>{r.dongName}</span>
                  <span className={styles.gu}>
                    서울 {r.sigunguName}
                    {i === 0 ? ' · 기본 동네' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className={styles.remove}
                  disabled={!canRemove}
                  onClick={() => setRemoving(r)}
                  aria-label={`${r.sigunguName} ${r.dongName} 빼기`}
                >
                  빼기
                </button>
              </li>
            ))}
          </ul>
          <p className={styles.note} data-warn={!data.canChange}>
            {data.canChange
              ? `최소 ${data.minCount}곳 · 최대 ${data.maxCount}곳 · 추가나 빼기는 한 시즌에 한 번만 할 수 있어요`
              : `이번 시즌에는 이미 내 동네를 바꿨어요.${
                  data.nextChangeAvailableAt
                    ? ` ${formatDate(data.nextChangeAvailableAt)}부터 다시 바꿀 수 있어요`
                    : ''
                }`}
          </p>
        </div>
      )}

      <Dialog
        open={removing !== null}
        title={removing ? `${removing.sigunguName} ${eulReul(removing.dongName)} 뺄까요?` : ''}
        description={[
          '이번 시즌에는 내 동네를\n다시 바꿀 수 없어요',
          ...(removing && removing.localRegionId === items[0]?.localRegionId
            ? ['기본 동네를 빼면 현황·랭킹의\n기본 구가 바뀔 수 있어요']
            : []),
        ]}
        confirmLabel="빼기"
        onCancel={() => setRemoving(null)}
        onConfirm={remove}
        busy={busy}
      />
    </Screen>
  );
}
