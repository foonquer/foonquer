import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  getShopItems,
  purchaseItem,
  purchaseSet,
  RARITY_NAME,
  saveAppearance,
  type ShopCategory,
  type ShopItem,
  type ShopSet,
} from '../../api/mukkaebi';
import { AppHeader } from '../../components/AppHeader';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { ItemIcon } from '../../components/ItemIcon';
import { MukkaebiFigure } from '../../components/MukkaebiFigure';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatPoint } from '../../lib/format';
import { eulReul } from '../../lib/korean';
import { useAsync } from '../../lib/useAsync';
import styles from './Mukkaebi.module.css';

const TABS: { value: ShopCategory; label: string }[] = [
  { value: 'HAT', label: '모자' },
  { value: 'FACE', label: '얼굴' },
  { value: 'PROP', label: '소품' },
  { value: 'HONOR', label: '명예' },
];

const SLOT = { HAT: 'hatItemId', FACE: 'faceItemId', PROP: 'propItemId' } as const;

type Sheet =
  | { kind: 'item'; item: ShopItem }
  | { kind: 'set'; set: ShopSet }
  | {
      kind: 'bought';
      name: string;
      itemId: number | null;
      category: string | null;
      balance: number;
    };

/** 상점 /me/mukkaebi/shop?category= — 세트 배너·모자·얼굴·소품·명예 (SHOP-01·03·04) */
export function ShopPage() {
  const [params, setParams] = useSearchParams();
  const category = TABS.find((t) => t.value === params.get('category'))?.value ?? 'HAT';
  const { data, error, reload, mutate } = useAsync(() => getShopItems(category), [category]);
  const [sheet, setSheet] = useState<Sheet | null>(null);

  if (error) {
    return (
      <Screen>
        <AppHeader title="상점" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  return (
    <Screen>
      <AppHeader
        title="상점"
        right={
          data && (
            <Link
              to="/me/points"
              className={styles.point}
              aria-label={`내 먹포인트 ${data.pointBalance}`}
            >
              <span aria-hidden="true">P</span>
              {data.pointBalance.toLocaleString('ko-KR')}
            </Link>
          )
        }
      />
      {!data ? (
        <Loading />
      ) : (
        <div className={styles.content}>
          {data.sets.map((set) => (
            <button
              key={set.setId}
              type="button"
              className={styles.set}
              onClick={() => setSheet({ kind: 'set', set })}
            >
              {set.badge && <span className={styles.badge}>{set.badge}</span>}
              <span className={styles.setName}>{set.name}</span>
              <span className={styles.setText}>{set.description}</span>
              <span className={styles.setPrice}>
                {formatPoint(set.price)}
                <s>{formatPoint(set.originalPrice)}</s>
                {!set.purchasable && (
                  <span className={styles.setOwned}>이미 가진 아이템이 있어요</span>
                )}
              </span>
            </button>
          ))}

          <div className={styles.tabs} role="tablist" aria-label="상점 종류">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={t.value === category}
                onClick={() => setParams({ category: t.value }, { replace: true })}
              >
                {t.label}
              </button>
            ))}
          </div>
          {category === 'HONOR' && (
            <p className={styles.caption}>포인트로는 살 수 없어요. 업적을 달성하면 열려요.</p>
          )}

          <div className={styles.grid}>
            {data.items.map((item) => (
              <button
                key={item.itemId}
                type="button"
                className={styles.tile}
                data-owned={item.owned}
                onClick={() => setSheet({ kind: 'item', item })}
              >
                {item.badge && !item.owned && <span className={styles.newTag}>{item.badge}</span>}
                <ItemIcon category={item.category} rarity={item.rarity} size={52} />
                <span className={styles.tileName}>{item.name}</span>
                <span className={styles.tileSub}>
                  {item.equipped
                    ? '착용 중'
                    : item.owned
                      ? '보유'
                      : item.purchasable && item.price !== null
                        ? formatPoint(item.price)
                        : (item.requiredAchievement?.name ?? '명예 아이템')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {data && (
        <PurchaseSheet
          sheet={sheet}
          balance={data.pointBalance}
          onClose={() => setSheet(null)}
          onBought={(next) => {
            setSheet(next);
            mutate((prev) => ({ ...prev, pointBalance: next.balance }));
            reload();
          }}
        />
      )}
    </Screen>
  );
}

function PurchaseSheet({
  sheet,
  balance,
  onClose,
  onBought,
}: {
  sheet: Sheet | null;
  balance: number;
  onClose: () => void;
  onBought: (next: Extract<Sheet, { kind: 'bought' }>) => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const buy = async () => {
    if (!sheet || sheet.kind === 'bought') return;
    setBusy(true);
    try {
      if (sheet.kind === 'item') {
        const r = await purchaseItem(sheet.item.itemId);
        onBought({
          kind: 'bought',
          name: r.name,
          itemId: r.itemId,
          category: sheet.item.category,
          balance: r.pointBalance,
        });
      } else {
        const r = await purchaseSet(sheet.set.setId, true);
        toast({ message: `${eulReul(r.name)} 사서 바로 착용했어요`, check: true });
        onBought({
          kind: 'bought',
          name: r.name,
          itemId: null,
          category: null,
          balance: r.pointBalance,
        });
      }
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const equip = async (s: Extract<Sheet, { kind: 'bought' }>) => {
    const slot = SLOT[s.category as keyof typeof SLOT];
    if (!slot || s.itemId === null) return;
    setBusy(true);
    try {
      await saveAppearance({ [slot]: s.itemId });
      toast({ message: `${eulReul(s.name)} 착용했어요`, check: true });
      navigate('/me/mukkaebi');
    } catch (err) {
      toast(errorMessage(err));
      setBusy(false);
    }
  };

  if (!sheet) return null;
  if (sheet.kind === 'bought') {
    return (
      <BottomSheet open onClose={onClose} label="구매 완료">
        <p className={styles.sheetTitle}>{eulReul(sheet.name)} 샀어요!</p>
        <p className={styles.sheetText}>
          내 아이템에 들어갔어요. 남은 먹포인트는 {formatPoint(sheet.balance)}예요.
        </p>
        <div className={styles.sheetButtons}>
          <Button variant="soft" onClick={onClose}>
            계속 둘러보기
          </Button>
          {sheet.itemId !== null && SLOT[sheet.category as keyof typeof SLOT] && (
            <Button onClick={() => equip(sheet)} disabled={busy}>
              바로 착용하기
            </Button>
          )}
        </div>
      </BottomSheet>
    );
  }

  const isSet = sheet.kind === 'set';
  const name = isSet ? sheet.set.name : sheet.item.name;
  const price = isSet ? sheet.set.price : sheet.item.price;
  const purchasable = isSet ? sheet.set.purchasable : sheet.item.purchasable && !sheet.item.owned;
  const short = price !== null ? price - balance : 0;
  return (
    <BottomSheet open onClose={onClose} label={name}>
      <MukkaebiFigure
        wearing={
          isSet
            ? Object.fromEntries(
                sheet.set.items.map((i) => [i.category, { name: i.name, rarity: i.rarity }]),
              )
            : { [sheet.item.category]: { name: sheet.item.name, rarity: sheet.item.rarity } }
        }
        badge="입어보는 중"
        height={200}
      />
      <p className={styles.sheetTitle}>
        {name}
        {!isSet && <span className={styles.rarity}>{RARITY_NAME[sheet.item.rarity]}</span>}
      </p>
      <p className={styles.sheetText}>
        {isSet
          ? `${sheet.set.items.map((i) => i.name).join(' + ')} · 따로 사면 ${formatPoint(sheet.set.originalPrice)}`
          : (sheet.item.description ?? '')}
      </p>
      {!purchasable ? (
        <>
          <p className={styles.balanceBox}>
            <span>
              {isSet
                ? '세트 아이템을 이미 하나 가지고 있어요'
                : sheet.item.owned
                  ? '이미 가진 아이템이에요'
                  : (sheet.item.unlockCondition ?? '지금은 살 수 없어요')}
            </span>
          </p>
          <Button variant="soft" onClick={onClose}>
            닫기
          </Button>
        </>
      ) : short > 0 ? (
        <>
          <p className={styles.balanceBox}>
            <span>보유 먹포인트</span>
            <strong>
              {formatPoint(balance)} ·{' '}
              <span className={styles.short}>{formatPoint(short)} 부족</span>
            </strong>
          </p>
          <p className={styles.sheetText}>
            먹포인트가 조금 부족해요. 글 리뷰 {Math.ceil(short / 30)}개면 모을 수 있어요!
          </p>
          <div className={styles.sheetButtons}>
            <Button variant="soft" onClick={onClose}>
              취소
            </Button>
            <Button onClick={() => navigate('/me/points')}>포인트 모으러 가기</Button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.balanceBox}>
            <span>구매 후 남는 먹포인트</span>
            <strong>
              {formatPoint(balance)} → {formatPoint(balance - (price ?? 0))}
            </strong>
          </p>
          <div className={styles.sheetButtons}>
            <Button variant="soft" onClick={onClose}>
              취소
            </Button>
            <Button onClick={buy} disabled={busy}>
              {formatPoint(price ?? 0)}로 구매하기
            </Button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}
