import { useState } from 'react';
import { useNavigate } from 'react-router';
import { getMyPicks, type Pick, type PickCandidate, saveMyPicks } from '../../api/profile';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { joinDot } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { usePaged } from '../../lib/usePaged';
import { SearchBar } from '../search/SearchBar';
import styles from './MyRecords.module.css';

/** 한 줄 코멘트 최대 길이 (서버 PICK-02와 같다) */
const COMMENT_MAX = 30;

type Draft = Pick | (PickCandidate & { comment: string | null });

/** 내 PICK 편집 /me/pick — 정복한 가게 중 최대 10곳, 순서·한 줄 코멘트 (PICK-01·02) */
export function PickEditPage() {
  const { data, error, reload } = useAsync(() => getMyPicks({ size: 1 }), []);
  if (error) {
    return (
      <Screen>
        <AppHeader title="내 PICK 편집" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="내 PICK 편집" />
        <Loading />
      </Screen>
    );
  }
  return <Editor initial={data.picks} max={data.maxPicks} />;
}

function Editor({ initial, max }: { initial: Pick[]; max: number }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [picks, setPicks] = useState<Draft[]>(initial);
  const [keyword, setKeyword] = useState('');
  const [saving, setSaving] = useState(false);
  const candidates = usePaged(
    async (page) =>
      (await getMyPicks({ keyword: keyword || undefined, page, size: 20 })).candidates,
    [keyword],
  );
  const picked = new Set(picks.map((p) => p.restaurantId));

  const toggle = (c: PickCandidate) => {
    if (picked.has(c.restaurantId)) {
      setPicks((list) => list.filter((p) => p.restaurantId !== c.restaurantId));
    } else if (picks.length >= max) {
      toast(`PICK은 ${max}곳까지 고를 수 있어요`);
    } else {
      setPicks((list) => [...list, { ...c, comment: null }]);
    }
  };
  const move = (index: number, delta: -1 | 1) =>
    setPicks((list) => {
      if (index + delta < 0 || index + delta >= list.length) return list;
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  const setComment = (index: number, comment: string) =>
    setPicks((list) => list.map((p, i) => (i === index ? { ...p, comment } : p)));

  const save = async () => {
    setSaving(true);
    try {
      await saveMyPicks(
        picks.map((p) => ({ restaurantId: p.restaurantId, comment: p.comment?.trim() || null })),
      );
      toast({ message: '내 PICK을 저장했어요', check: true });
      navigate(-1);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <Button onClick={save} disabled={saving}>
          저장
        </Button>
      }
    >
      <AppHeader title="내 PICK 편집" />
      <div className={styles.content}>
        <p className={styles.note} style={{ textAlign: 'left' }}>
          내가 정복한 가게 중에서만 고를 수 있어요. 최대 {max}곳 · 한 줄 코멘트는 선택이에요. PICK은
          내 프로필과 랭킹 TOP 3에서 다른 탐방러에게 보여요.
        </p>
        <p className={styles.summary}>
          <strong>
            선택 {picks.length} / {max}
          </strong>
          <span>정복한 가게 {candidates.totalCount}곳</span>
        </p>

        {picks.length > 0 && (
          <ol className={styles.picks} aria-label="고른 PICK">
            {picks.map((p, i) => (
              <li key={p.restaurantId} className={styles.pick}>
                <div className={styles.pickHead}>
                  <span className={styles.pickOrder}>{i + 1}</span>
                  <span className={styles.rowText}>
                    <span className={styles.rowName}>{p.name}</span>
                    <span className={styles.rowMeta}>
                      {joinDot([p.categoryName, `방문 ${p.visitCount}회`])}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`${p.name} 위로`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`${p.name} 아래로`}
                    disabled={i === picks.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`${p.name} 빼기`}
                    onClick={() =>
                      setPicks((list) => list.filter((x) => x.restaurantId !== p.restaurantId))
                    }
                  >
                    ×
                  </button>
                </div>
                <input
                  className={styles.comment}
                  aria-label={`${p.name} 한 줄 코멘트`}
                  placeholder="한 줄 코멘트 (선택, 30자)"
                  maxLength={COMMENT_MAX}
                  value={p.comment ?? ''}
                  onChange={(e) => setComment(i, e.target.value)}
                />
              </li>
            ))}
          </ol>
        )}

        <SearchBar onSubmit={setKeyword} placeholder="정복한 가게 검색" />
        {candidates.loading && candidates.items.length === 0 ? (
          <Loading />
        ) : candidates.items.length === 0 ? (
          <EmptyState
            title={
              keyword ? `'${keyword}'에 맞는 정복한 가게가 없어요` : '아직 정복한 가게가 없어요'
            }
            description="방문 인증하고 맛 별점을 남기면 PICK으로 고를 수 있어요."
          />
        ) : (
          <ul className={styles.rows}>
            {candidates.items.map((c) => (
              <li key={c.restaurantId}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={picked.has(c.restaurantId)}
                  className={styles.candidate}
                  onClick={() => toggle(c)}
                >
                  <span className={styles.rowText}>
                    <span className={styles.rowName}>{c.name}</span>
                    <span className={styles.rowMeta}>
                      {joinDot([c.categoryName, c.dongName, `방문 ${c.visitCount}회`])}
                    </span>
                  </span>
                  <span className={styles.check} aria-hidden="true">
                    {picked.has(c.restaurantId) ? '✓' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {candidates.hasNext && (
          <Button
            variant="white"
            size="sm"
            onClick={candidates.loadMore}
            disabled={candidates.loading}
          >
            더 보기
          </Button>
        )}
      </div>
    </Screen>
  );
}
