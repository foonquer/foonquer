import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  CATEGORY_NAME,
  getItemBoxes,
  type ItemBox,
  openItemBox,
  RARITY_NAME,
  saveAppearance,
} from '../../api/mukkaebi';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { ItemIcon } from '../../components/ItemIcon';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatDate, formatPoint } from '../../lib/format';
import { eulReul, iGa } from '../../lib/korean';
import { useAsync } from '../../lib/useAsync';
import flow from '../visit/Flow.module.css';
import styles from './Mukkaebi.module.css';

type Opened = Awaited<ReturnType<typeof openItemBox>>;
const SLOT = { HAT: 'hatItemId', FACE: 'faceItemId', PROP: 'propItemId' } as const;

/** 아이템 상자 /me/mukkaebi/boxes — 상자 열기·결과 (CHAR-05·06) */
export function ItemBoxesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, reload } = useAsync(getItemBoxes, []);
  const [opening, setOpening] = useState<ItemBox | null>(null);
  const [result, setResult] = useState<Opened | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async (box: ItemBox) => {
    setBusy(true);
    try {
      setResult(await openItemBox(box.boxId));
      reload();
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const equip = async (item: NonNullable<Opened['item']>) => {
    const slot = SLOT[item.category as keyof typeof SLOT];
    if (!slot) return;
    setBusy(true);
    try {
      await saveAppearance({ [slot]: item.itemId });
      toast({ message: `${eulReul(item.name)} 착용했어요`, check: true });
      navigate('/me/mukkaebi', { replace: true });
    } catch (err) {
      toast(errorMessage(err));
      setBusy(false);
    }
  };

  const done = () => {
    setOpening(null);
    setResult(null);
  };

  if (result) {
    const item = result.item;
    return (
      <Screen
        footer={
          item && SLOT[item.category as keyof typeof SLOT] ? (
            <>
              <Button onClick={() => equip(item)} disabled={busy}>
                바로 착용하기
              </Button>
              <Button variant="white" onClick={done}>
                나중에 착용할게요
              </Button>
            </>
          ) : (
            <Button onClick={done}>확인</Button>
          )
        }
      >
        <AppHeader title="아이템 상자" onBack={done} />
        <div className={flow.content}>
          <div className={flow.center}>
            <span className={styles.boxLabel}>NEW ITEM</span>
            {item ? (
              <>
                <h2 className={flow.title}>{eulReul(item.name)} 얻었어요!</h2>
                <div className={styles.reveal}>
                  <ItemIcon category={item.category} rarity={item.rarity} size={120} />
                </div>
                <p className={styles.chips}>
                  <span>{RARITY_NAME[item.rarity]}</span>
                  <span>{CATEGORY_NAME[item.category]}</span>
                </p>
                <p className={flow.subtitle}>
                  {item.price !== null && `상점에서 ${formatPoint(item.price)}인 아이템이에요. `}내
                  아이템에 넣어 뒀어요.
                </p>
              </>
            ) : (
              <>
                <h2 className={flow.title}>먹포인트 +{formatPoint(result.point ?? 0)} 받았어요!</h2>
                <p className={flow.subtitle}>
                  상자에서 나올 아이템을 모두 모아서 먹포인트로 드렸어요.
                </p>
              </>
            )}
          </div>
        </div>
      </Screen>
    );
  }

  if (opening) {
    return (
      <Screen
        footer={
          <Button onClick={() => open(opening)} disabled={busy}>
            상자 열기
          </Button>
        }
      >
        <AppHeader title="아이템 상자" onBack={() => setOpening(null)} />
        <div className={flow.content}>
          <div className={flow.center}>
            <span className={styles.boxLabel}>{opening.title}</span>
            <h2 className={flow.title}>아이템 상자를 열어 볼까요?</h2>
            <button
              type="button"
              className={styles.giftBox}
              aria-label="상자를 눌러 열기"
              disabled={busy}
              onClick={() => open(opening)}
            />
            <p className={flow.subtitle}>톡 누르면 열려요</p>
            <p className={styles.chips}>
              <span>모자 · 얼굴 · 소품 중 하나</span>
              <span>레어 등장 20%</span>
            </p>
          </div>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title="아이템 상자" />
      <div className={styles.content}>
        {error ? (
          <EmptyState title={errorMessage(error)} onRetry={reload} />
        ) : !data ? (
          <Loading />
        ) : data.items.length === 0 ? (
          <EmptyState
            title="아직 받은 상자가 없어요"
            description="먹깨비가 자라면 성장 보상으로 아이템 상자를 받아요."
          />
        ) : (
          <ul className={styles.boxList}>
            {data.items.map((b) => (
              <li key={b.boxId}>
                <span className={styles.boxIcon} data-opened={b.opened} aria-hidden="true" />
                <span className={styles.boxText}>
                  <strong>{b.title}</strong>
                  <span>
                    {b.opened
                      ? b.resultItem
                        ? `${iGa(b.resultItem.name)} 나왔어요`
                        : `먹포인트 +${b.resultPoint ?? 0}P`
                      : `${formatDate(b.receivedAt)} 받음`}
                  </span>
                </span>
                {!b.opened && (
                  <Button size="sm" block={false} onClick={() => setOpening(b)}>
                    열기
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Screen>
  );
}
