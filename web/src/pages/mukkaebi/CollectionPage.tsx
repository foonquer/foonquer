import { useState } from 'react';
import { craftItem, getCollection, getMyItems, RARITY_NAME } from '../../api/mukkaebi';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { ItemIcon } from '../../components/ItemIcon';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatPoint } from '../../lib/format';
import { eulReul } from '../../lib/korean';
import { useAsync } from '../../lib/useAsync';
import styles from './Mukkaebi.module.css';

/** 전설의 방망이 = 황금 방망이 3개 (서버 item_recipe) */
const LEGEND = 'CLUB_LEGEND';
const GOLD = 'CLUB_GOLD';
const GOLD_NEED = 3;

async function load() {
  const [collection, mine] = await Promise.all([getCollection(), getMyItems()]);
  const gold = mine.items.find((i) => i.code === GOLD)?.quantity ?? 0;
  return { collection, gold };
}

/** 먹깨비 도감 /me/mukkaebi/collection (CHAR-07) — 성장 단계·아이템 컬렉션·구 배경, 전설의 방망이 합성(CHAR-10) */
export function CollectionPage() {
  const toast = useToast();
  const { data, error, reload } = useAsync(load, []);
  const [busy, setBusy] = useState(false);

  if (error) {
    return (
      <Screen>
        <AppHeader title="먹깨비 도감" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="먹깨비 도감" />
        <Loading />
      </Screen>
    );
  }

  const { collection: c, gold } = data;
  const legend = c.items.find((i) => i.code === LEGEND);
  const ownedItems = c.items.filter((i) => i.owned).length;
  const craft = async () => {
    if (!legend) return;
    setBusy(true);
    try {
      const r = await craftItem(legend.itemId);
      toast({ message: `${eulReul(r.item.name)} 만들었어요!`, check: true });
      reload();
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        title="먹깨비 도감"
        right={
          <span className={styles.collected}>
            수집 {c.collectedCount} / {c.totalCount}
          </span>
        }
      />
      <div className={styles.content}>
        <section className={styles.card} aria-label="성장 단계">
          <p className={styles.cardHead}>
            <strong>성장 단계</strong>
            <span>레벨이 오르면 먹깨비가 자라요</span>
          </p>
          <ol className={styles.stages}>
            {c.stages.map((s) => (
              <li key={s.stage} data-reached={s.reached} data-current={s.isCurrent}>
                <span className={styles.stageDot} aria-hidden="true" />
                {s.name}
                <small>{s.isCurrent ? '지금' : s.reached ? '지났어요' : `LV.${s.fromLevel}`}</small>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.card} aria-label="아이템 컬렉션">
          <p className={styles.cardHead}>
            <strong>아이템 컬렉션</strong>
            <span>
              {c.items.length}개 중 {ownedItems}개
            </span>
          </p>
          <div className={styles.grid}>
            {c.items.map((i) => (
              <div key={i.itemId} className={styles.tile} data-owned={i.owned}>
                <ItemIcon category={i.category} rarity={i.rarity} size={48} owned={i.owned} />
                <span className={styles.tileName}>{i.owned ? i.name : '???'}</span>
                <span className={styles.tileSub}>
                  {i.owned ? RARITY_NAME[i.rarity] : (i.howToGet ?? '')}
                </span>
              </div>
            ))}
          </div>
          {c.nextGoal && (
            <p className={styles.goal}>
              다음 목표 · {c.nextGoal.name}
              {c.nextGoal.price !== null && ` (${formatPoint(c.nextGoal.price)})`}
            </p>
          )}
        </section>

        {legend && !legend.owned && (
          <section className={styles.card} aria-label="전설의 방망이 만들기">
            <p className={styles.cardHead}>
              <strong>전설의 방망이</strong>
              <span>
                황금 방망이 {Math.min(gold, GOLD_NEED)} / {GOLD_NEED}
              </span>
            </p>
            <p className={styles.sheetText}>황금 방망이 3개를 모으면 합쳐서 만들 수 있어요.</p>
            <Button size="sm" onClick={craft} disabled={gold < GOLD_NEED || busy}>
              전설의 방망이 만들기
            </Button>
          </section>
        )}

        <section className={styles.card} aria-label="구 배경">
          <p className={styles.cardHead}>
            <strong>구 배경</strong>
            <span>
              {c.backgrounds.length}개 구 중 {c.backgrounds.filter((b) => b.unlocked).length}개
            </span>
          </p>
          <div className={styles.bgGrid}>
            {c.backgrounds.map((b) => (
              <span key={b.sigunguId} className={styles.bgCell} data-unlocked={b.unlocked}>
                {b.sigunguName}
              </span>
            ))}
          </div>
          <p className={styles.caption}>
            한 구에서 서로 다른 가게 10곳을 정복하면 그 구 배경을 얻어요.
          </p>
        </section>
      </div>
    </Screen>
  );
}
