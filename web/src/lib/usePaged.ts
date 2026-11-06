import { useCallback, useEffect, useState } from 'react';

type PageLike<T> = { items: T[]; hasNext: boolean; totalCount: number };
type Target = { key: string; page: number; version: number };

/**
 * "더 보기"로 이어 붙이는 목록. deps가 바뀌면 1쪽부터 다시 부르고, 늦게 온 이전 응답은 버린다.
 * 예) const list = usePaged((page) => getMyReviews({ page }), [sort]);
 */
export function usePaged<P extends PageLike<unknown>>(
  load: (page: number) => Promise<P>,
  deps: readonly unknown[],
) {
  type T = P['items'][number];
  const key = JSON.stringify(deps);
  const [want, setWant] = useState<Target>({ key, page: 1, version: 0 });
  // deps가 바뀌면 "더 보기"로 늘린 쪽 수를 버린다 (A → B → A로 돌아와도 1쪽부터)
  if (want.key !== key) setWant({ key, page: 1, version: 0 });
  const target = want.key === key ? want : { key, page: 1, version: 0 };
  const [loaded, setLoaded] = useState<{ at: Target; pages: P[] } | null>(null);
  const [failed, setFailed] = useState<{ at: Target; error: unknown } | null>(null);

  useEffect(() => {
    let alive = true;
    load(target.page).then(
      (data) =>
        alive &&
        setLoaded((prev) => ({
          at: target,
          pages: target.page === 1 || prev?.at.key !== target.key ? [data] : [...prev.pages, data],
        })),
      (error: unknown) => alive && setFailed({ at: target, error }),
    );
    return () => {
      alive = false;
    };
    // load는 deps로 만든 함수라 target이 같으면 다시 부르지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.key, target.page, target.version]);

  const same = (a: Target | undefined) =>
    a?.key === target.key && a.page === target.page && a.version === target.version;
  const pages = loaded?.at.key === key ? loaded.pages : [];
  const last = pages[pages.length - 1];
  const error = same(failed?.at) ? failed?.error : undefined;

  const loadMore = useCallback(
    () => setWant({ ...target, page: pages.length + 1 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, pages.length, target.version],
  );
  const reload = useCallback(
    () => setWant({ key, page: 1, version: target.version + 1 }),
    [key, target.version],
  );
  /** 목록의 한 항목만 바꾼다 (도움돼요 등) */
  const update = useCallback(
    (match: (item: T) => boolean, next: T) =>
      setLoaded((prev) =>
        prev
          ? {
              ...prev,
              pages: prev.pages.map((p) => ({
                ...p,
                items: (p.items as T[]).map((i) => (match(i) ? next : i)),
              })),
            }
          : prev,
      ),
    [],
  );

  return {
    items: pages.flatMap((p) => p.items as T[]),
    /** 1쪽 응답 전체 (요약 등 목록 밖 값) */
    first: pages[0],
    totalCount: last?.totalCount ?? 0,
    hasNext: last?.hasNext ?? false,
    loading: !same(loaded?.at) && !error,
    error,
    loadMore,
    reload,
    update,
  };
}
