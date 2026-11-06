import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePaged } from '../lib/usePaged';

/** 쪽마다 "정렬-쪽" 항목 하나, 2쪽까지 있다 */
const load = vi.fn((sort: string, page: number) =>
  Promise.resolve({ items: [`${sort}-${page}`], hasNext: page < 2, totalCount: 2 }),
);

describe('usePaged', () => {
  it('더 보기 뒤 정렬을 바꿨다가 되돌리면 1쪽부터 다시 부른다 (A → B → A)', async () => {
    const { result, rerender } = renderHook(
      ({ sort }) => usePaged((page) => load(sort, page), [sort]),
      { initialProps: { sort: 'LATEST' } },
    );
    await waitFor(() => expect(result.current.items).toEqual(['LATEST-1']));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toEqual(['LATEST-1', 'LATEST-2']));

    rerender({ sort: 'SCORE_LOW' });
    await waitFor(() => expect(result.current.items).toEqual(['SCORE_LOW-1']));
    rerender({ sort: 'LATEST' });
    await waitFor(() => expect(result.current.items).toEqual(['LATEST-1']));
    expect(load).toHaveBeenLastCalledWith('LATEST', 1);
    expect(result.current.hasNext).toBe(true);
  });
});
