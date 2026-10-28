import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Dong } from '../../api/regions';
import { addLocalRegion, getLocalRegions } from '../../api/users';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { DongFinder } from '../../components/DongFinder';
import { PageTitle } from '../../components/PageTitle';
import { Screen } from '../../components/Screen';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { eulReul } from '../../lib/korean';
import { useAsync } from '../../lib/useAsync';
import styles from './LocalRegions.module.css';

/** 내 동네 추가 /me/regions/add (REGION-01·02로 찾고 LOCAL-02로 추가) */
export function AddLocalRegionPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const list = useAsync(getLocalRegions, []);
  const [picked, setPicked] = useState<Dong | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const items = list.data?.items ?? [];
  const first = items[0];
  const max = list.data?.maxCount ?? 3;

  const pick = (dong: Dong) => {
    if (items.some((r) => r.regionId === dong.regionId)) {
      toast('이미 내 동네에 있는 동네예요');
      return;
    }
    setPicked(picked?.regionId === dong.regionId ? null : dong);
  };

  const add = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const { message } = await addLocalRegion(picked.regionId);
      toast(message.replace(/\.$/, ''));
      navigate('/me/regions', { replace: true });
    } catch (err) {
      toast(errorMessage(err));
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <Screen
      footer={
        <Button onClick={() => setConfirming(true)} disabled={!picked}>
          {picked ? `${picked.sigunguName} ${picked.dongName} 추가하기` : '선택 완료'}
        </Button>
      }
    >
      <AppHeader title="내 동네 추가" />
      <div className={styles.content}>
        <span className={styles.chip}>
          내 동네 {items.length} / {max}
          {first ? ` · ${first.sigunguName} ${first.dongName}` : ''}
        </span>
        <PageTitle
          className={styles.title}
          title={'어느 동네를\n추가할까요?'}
          description="추가한 동네에서 쓴 리뷰에는 ‘로컬’이 표시돼요"
        />
      </div>
      <div className={styles.finder}>
        <DongFinder selectedIds={picked ? [picked.regionId] : []} onSelect={pick} />
        <p className={styles.finderNote}>
          최대 {max}곳 · 내 동네는 한 시즌에 한 번만 바꿀 수 있어요
        </p>
      </div>

      <Dialog
        open={confirming && picked !== null}
        title={picked ? `${picked.sigunguName} ${eulReul(picked.dongName)} 추가할까요?` : ''}
        description={['이번 시즌에는 내 동네를\n다시 바꿀 수 없어요']}
        confirmLabel="추가"
        onCancel={() => setConfirming(false)}
        onConfirm={add}
        busy={busy}
      />
    </Screen>
  );
}
