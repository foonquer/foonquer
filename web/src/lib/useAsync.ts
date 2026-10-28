import { useCallback, useEffect, useState } from 'react';

type State<T> = { depsKey: string; version: number; data?: T; error?: unknown };

/**
 * 화면에 필요한 데이터를 불러온다. deps가 바뀌면 다시 부르고, 늦게 온 이전 응답은 버린다.
 * reload()로 다시 부르는 동안에는 이전 데이터를 그대로 보여 준다.
 *
 * 예) const { data, error, loading, reload } = useAsync(() => getRestaurant(id), [id]);
 */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [version, setVersion] = useState(0);
  const depsKey = JSON.stringify(deps);
  const [state, setState] = useState<State<T>>({ depsKey: '', version: -1 });

  useEffect(() => {
    let alive = true;
    load().then(
      (data) => alive && setState({ depsKey, version, data }),
      (error: unknown) => alive && setState({ depsKey, version, error }),
    );
    return () => {
      alive = false;
    };
    // load는 deps로 만든 함수라 deps가 같으면 다시 부르지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  /** 받은 데이터를 화면에서 바로 고친다 (저장한 뒤 다시 부르지 않을 때) */
  const mutate = useCallback(
    (update: (prev: T) => T) =>
      setState((prev) => (prev.data === undefined ? prev : { ...prev, data: update(prev.data) })),
    [],
  );

  const sameDeps = state.depsKey === depsKey;
  return {
    data: sameDeps ? state.data : undefined,
    error: sameDeps && state.version === version ? state.error : undefined,
    loading: !sameDeps || state.version !== version,
    reload,
    mutate,
  };
}
