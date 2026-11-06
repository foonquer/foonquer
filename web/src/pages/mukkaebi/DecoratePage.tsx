import { type ReactNode, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  type Appearance,
  CATEGORY_NAME,
  getMyItems,
  getMyMukkaebi,
  type ItemCategory,
  type MyMukkaebi,
  type OwnedBackground,
  type OwnedItem,
  saveAppearance,
} from '../../api/mukkaebi';
import mukkaebi from '../../assets/illust/mukkaebi.svg';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { ItemIcon } from '../../components/ItemIcon';
import { MukkaebiFigure } from '../../components/MukkaebiFigure';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import styles from './Mukkaebi.module.css';

type Tab = ItemCategory | 'BACKGROUND';
type Draft = Record<ItemCategory, number | null> & { BACKGROUND: number | null };

const SLOT: Record<ItemCategory, keyof Appearance> = {
  HAT: 'hatItemId',
  FACE: 'faceItemId',
  PROP: 'propItemId',
  SKIN: 'skinItemId',
  CLUB: 'clubItemId',
};

function draftOf(m: MyMukkaebi): Draft {
  return {
    HAT: m.equipped.hat?.itemId ?? null,
    FACE: m.equipped.face?.itemId ?? null,
    PROP: m.equipped.prop?.itemId ?? null,
    SKIN: m.equipped.skin?.itemId ?? null,
    CLUB: m.equipped.club?.itemId ?? null,
    BACKGROUND: m.background?.sigunguId ?? null,
  };
}

async function load() {
  const [m, owned] = await Promise.all([getMyMukkaebi(), getMyItems()]);
  return { m, items: owned.items, backgrounds: owned.backgrounds };
}

/** 꾸미기 /me/mukkaebi/decorate?tab= — 가진 아이템·구 배경으로 입어 보고 저장 (CHAR-02·03) */
export function DecoratePage() {
  const { data, error, reload } = useAsync(load, []);
  if (error) {
    return (
      <Screen>
        <AppHeader title="꾸미기" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="꾸미기" />
        <Loading />
      </Screen>
    );
  }
  return <Decorate m={data.m} items={data.items} backgrounds={data.backgrounds} />;
}

function Decorate({
  m,
  items,
  backgrounds,
}: {
  m: MyMukkaebi;
  items: OwnedItem[];
  backgrounds: OwnedBackground[];
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const saved = draftOf(m);
  const [draft, setDraft] = useState<Draft>(saved);
  const [saving, setSaving] = useState(false);
  // 종류(기본 먹깨비·밤하늘)는 늘 맨 앞 (피그마 302:3957), 방망이 칸은 가진 것이 있을 때만
  const tabs: Tab[] = [
    'SKIN',
    'HAT',
    'FACE',
    'PROP',
    'BACKGROUND',
    ...(items.some((i) => i.category === 'CLUB') ? (['CLUB'] as const) : []),
  ];
  const tab: Tab = tabs.find((t) => t === params.get('tab')) ?? 'HAT';
  const tabName = (t: Tab) =>
    t === 'BACKGROUND' ? '배경' : t === 'SKIN' ? '종류' : CATEGORY_NAME[t];
  const changed = (Object.keys(draft) as Tab[]).filter((k) => draft[k] !== saved[k]);

  const nameOf = (c: ItemCategory) => {
    const item = items.find((i) => i.itemId === draft[c]);
    return item ? { code: item.code, name: item.name, rarity: item.rarity } : null;
  };
  const wearing = {
    HAT: nameOf('HAT'),
    FACE: nameOf('FACE'),
    PROP: nameOf('PROP'),
    SKIN: nameOf('SKIN'),
    CLUB: nameOf('CLUB'),
  };
  const bg = backgrounds.find((b) => b.sigunguId === draft.BACKGROUND);

  const save = async () => {
    setSaving(true);
    try {
      const body: Appearance = {};
      for (const k of changed) {
        if (k === 'BACKGROUND') body.bgSigunguId = draft.BACKGROUND;
        else body[SLOT[k]] = draft[k];
      }
      await saveAppearance(body);
      toast({ message: '먹깨비를 꾸몄어요', check: true });
      navigate('/me/mukkaebi', { replace: true });
    } catch (err) {
      toast(errorMessage(err));
      setSaving(false);
    }
  };

  const tile = (key: string, selected: boolean, onClick: () => void, body: ReactNode) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={selected}
      className={styles.tile}
      onClick={onClick}
    >
      {body}
    </button>
  );

  return (
    <Screen
      footer={
        <>
          <p className={styles.caption}>
            {changed.length > 0
              ? `변경 사항 ${changed.length}개 · 가진 아이템이라 바로 저장돼요`
              : '아이템을 눌러 입어 보세요'}
          </p>
          <Button onClick={save} disabled={changed.length === 0 || saving}>
            저장하기
          </Button>
        </>
      }
    >
      <AppHeader
        title="꾸미기"
        right={
          <button
            type="button"
            className={styles.reset}
            disabled={changed.length === 0}
            onClick={() => setDraft(saved)}
          >
            초기화
          </button>
        }
      />
      <div className={styles.content}>
        <MukkaebiFigure
          wearing={wearing}
          sizePercent={m.sizePercent}
          stage={m.stage}
          background={bg?.sigunguName}
          badge="미리보기"
          height={250}
        />
        <div className={styles.tabs} role="tablist" aria-label="꾸미기 칸">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={t === tab}
              onClick={() => setParams({ tab: t }, { replace: true })}
            >
              {tabName(t)}
            </button>
          ))}
        </div>

        <div className={styles.grid} role="radiogroup" aria-label={`${tabName(tab)} 고르기`}>
          {tile(
            'none',
            draft[tab] === null,
            () => setDraft({ ...draft, [tab]: null }),
            <>
              {tab === 'SKIN' ? (
                <>
                  <img src={mukkaebi} alt="" className={styles.basicBody} />
                  <span className={styles.tileName}>기본 먹깨비</span>
                  <span className={styles.tileSub}>{saved.SKIN === null ? '사용 중' : '보유'}</span>
                </>
              ) : (
                <>
                  <span className={styles.none}>없음</span>
                  <span className={styles.tileName}>없음</span>
                  <span className={styles.tileSub}>해제</span>
                </>
              )}
            </>,
          )}
          {tab === 'BACKGROUND'
            ? backgrounds.map((b) =>
                tile(
                  String(b.sigunguId),
                  draft.BACKGROUND === b.sigunguId,
                  () => setDraft({ ...draft, BACKGROUND: b.sigunguId }),
                  <>
                    <span className={styles.bgThumb}>{b.sigunguName.slice(0, 2)}</span>
                    <span className={styles.tileName}>{b.sigunguName}</span>
                    <span className={styles.tileSub}>
                      {saved.BACKGROUND === b.sigunguId ? '사용 중' : '보유'}
                    </span>
                  </>,
                ),
              )
            : items
                .filter((i) => i.category === tab)
                .map((i) =>
                  tile(
                    String(i.itemId),
                    draft[tab] === i.itemId,
                    () => setDraft({ ...draft, [tab]: i.itemId }),
                    <>
                      {i.isNew && <span className={styles.newTag}>NEW</span>}
                      <ItemIcon category={i.category} rarity={i.rarity} code={i.code} size={52} />
                      <span className={styles.tileName}>{i.name}</span>
                      <span className={styles.tileSub}>
                        {saved[tab] === i.itemId ? '착용 중' : '보유'}
                        {i.quantity > 1 && ` · ${i.quantity}개`}
                      </span>
                    </>,
                  ),
                )}
        </div>
        {tab === 'SKIN' && !items.some((i) => i.code === 'SKIN_NIGHTSKY') && (
          <p className={styles.caption}>밤하늘 먹깨비는 시즌 TOP 10 업적으로 받아요.</p>
        )}
        {tab === 'BACKGROUND' && backgrounds.length === 0 && (
          <p className={styles.caption}>
            한 구에서 서로 다른 가게 10곳을 정복하면 그 구 배경을 얻어요.
          </p>
        )}
        {(tab === 'HAT' || tab === 'FACE' || tab === 'PROP') && (
          <Link to={`/me/mukkaebi/shop?category=${tab}`} className={styles.more}>
            상점에서 {CATEGORY_NAME[tab]} 더 보기 ›
          </Link>
        )}
      </div>
    </Screen>
  );
}
