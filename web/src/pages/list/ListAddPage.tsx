import { useId, useState } from 'react';
import { type RestaurantCardItem, searchRestaurants } from '../../api/restaurants';
import { getSavedRestaurants, saveRestaurant, unsaveRestaurant } from '../../api/saved';
import { AppHeader } from '../../components/AppHeader';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { joinDot } from '../../lib/format';
import { useViewRegion } from '../../lib/region';
import { useAsync } from '../../lib/useAsync';
import { SearchBar } from '../search/SearchBar';
import styles from './List.module.css';

/** 메모 최대 길이 (서버 LIST-02와 같다) */
const MEMO_MAX = 50;

/** 맛집 추가 /list/add — 검색해서 가고 싶은 곳에 저장 (SEARCH-02 → LIST-02·03) */
export function ListAddPage() {
  const toast = useToast();
  const { region, error: regionError, retry: retryRegion } = useViewRegion();
  const [keyword, setKeyword] = useState('');
  // 이미 저장한 가게(LIST-01 지도 핀)는 저장됨으로 보여 준다 — 다시 저장하면 메모·알림이 처음 값으로 바뀐다
  const already = useAsync(() => getSavedRestaurants({ tab: 'WANT', size: 1 }), []);
  const [changed, setChanged] = useState<Map<number, boolean>>(new Map());
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [target, setTarget] = useState<RestaurantCardItem | null>(null);
  const isSavedId = (id: number) =>
    changed.get(id) ?? already.data?.pins.some((p) => p.restaurantId === id) ?? false;
  const mark = (id: number, saved: boolean) => setChanged((m) => new Map(m).set(id, saved));
  const { data, error, loading, reload } = useAsync(
    () =>
      keyword && region
        ? searchRestaurants({
            keyword,
            regionId: region.regionId,
            scope: 'SIGUNGU',
            sort: 'LOCAL_POPULAR',
            size: 20,
          })
        : Promise.resolve(null),
    [keyword, region?.regionId],
  );

  const unsave = async (r: RestaurantCardItem) => {
    if (pending.has(r.restaurantId)) return;
    setPending((s) => new Set(s).add(r.restaurantId));
    try {
      await unsaveRestaurant(r.restaurantId);
      mark(r.restaurantId, false);
      toast('저장을 취소했어요');
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setPending((s) => new Set([...s].filter((id) => id !== r.restaurantId)));
    }
  };

  const items = data?.data.items ?? [];
  return (
    <Screen>
      <AppHeader title="맛집 추가" />
      <div className={styles.content}>
        <SearchBar onSubmit={setKeyword} placeholder="가게 이름 검색" />
        <p className={styles.leadSub}>
          가고 싶은 가게를 검색해서 저장해 두세요
          {region && ` · ${region.sigunguName}에서 찾아요`}
        </p>
        {!keyword ? null : !region ? (
          regionError ? (
            <EmptyState title={errorMessage(regionError)} onRetry={retryRegion} />
          ) : (
            <Loading />
          )
        ) : error ? (
          <EmptyState title={errorMessage(error)} onRetry={reload} />
        ) : loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState
            title={`'${keyword}' 검색 결과가 없어요`}
            description="다른 이름으로 찾아보세요."
          />
        ) : (
          <>
            <p className={styles.listHead}>
              <span>
                '{keyword}' 검색 결과 {data?.data.totalCount}
              </span>
            </p>
            <ul className={styles.rows}>
              {items.map((r) => {
                const isSaved = isSavedId(r.restaurantId);
                return (
                  <li key={r.restaurantId} className={styles.row}>
                    <span className={styles.rowText}>
                      <span className={styles.rowName}>{r.name}</span>
                      <span className={styles.rowMeta}>{joinDot([r.categoryName])}</span>
                    </span>
                    {r.conquestState === 'CONQUERED' ? (
                      <span className={styles.saveState}>✓ 정복함</span>
                    ) : (
                      <button
                        type="button"
                        className={styles.save}
                        aria-pressed={isSaved}
                        aria-label={`${r.name} ${isSaved ? '저장 취소' : '저장'}`}
                        disabled={pending.has(r.restaurantId)}
                        onClick={() => (isSaved ? unsave(r) : setTarget(r))}
                      >
                        {isSaved ? '★ 저장됨' : '☆ 저장'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
      <SaveSheet target={target} onClose={() => setTarget(null)} onSaved={(id) => mark(id, true)} />
    </Screen>
  );
}

/** 저장하기 시트: 메모(선택) + 2주 뒤에 알려 주기 */
function SaveSheet({
  target,
  onClose,
  onSaved,
}: {
  target: RestaurantCardItem | null;
  onClose: () => void;
  onSaved: (restaurantId: number) => void;
}) {
  const toast = useToast();
  const memoId = useId();
  const [memo, setMemo] = useState('');
  const [remind, setRemind] = useState(true);
  const [saving, setSaving] = useState(false);

  const close = () => {
    setMemo('');
    setRemind(true);
    onClose();
  };
  const save = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await saveRestaurant(target.restaurantId, { memo: memo.trim() || null, remind });
      onSaved(target.restaurantId);
      toast({
        message: '가고 싶은 곳에 저장했어요',
        check: true,
        action: { label: '리스트 보기', to: '/list' },
      });
      close();
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={target !== null} onClose={close} label="가고 싶은 곳에 저장">
      <p className={styles.infoName}>{target?.name}</p>
      <p className={styles.infoMeta}>{target?.categoryName}</p>
      <label htmlFor={memoId} className={styles.fieldLabel}>
        메모 (선택)
      </label>
      <textarea
        id={memoId}
        className={styles.memoInput}
        placeholder="예: 수제비도 맛있대요, 주말엔 웨이팅"
        maxLength={MEMO_MAX}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
      />
      <label className={styles.remind}>
        <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
        <span>
          <strong>2주 뒤에 알려 주기</strong>
          <br />
          아직 안 가 봤으면 알림으로 한 번 더 알려 드려요
        </span>
      </label>
      <Button onClick={save} disabled={saving}>
        ☆ 가고 싶은 곳에 저장
      </Button>
    </BottomSheet>
  );
}
