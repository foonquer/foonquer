// 최근 검색 (이 기기에만 남긴다)

import { readJson, writeJson } from './storage';

export type RecentSearch =
  { type: 'keyword'; keyword: string } | { type: 'category'; categoryId: number; name: string };

const KEY = 'mk:recent-searches';
const MAX = 10;

const same = (a: RecentSearch, b: RecentSearch) =>
  a.type === 'keyword' && b.type === 'keyword'
    ? a.keyword === b.keyword
    : a.type === 'category' && b.type === 'category' && a.categoryId === b.categoryId;

export const recentSearches = {
  list: () => readJson<RecentSearch[]>(KEY, []),
  /** 맨 앞에 넣는다 (같은 검색은 앞으로 옮긴다) */
  add(item: RecentSearch) {
    const next = [item, ...this.list().filter((r) => !same(r, item))].slice(0, MAX);
    writeJson(KEY, next);
    return next;
  },
  remove(item: RecentSearch) {
    const next = this.list().filter((r) => !same(r, item));
    writeJson(KEY, next);
    return next;
  },
};

export const recentLabel = (r: RecentSearch) => (r.type === 'keyword' ? r.keyword : r.name);

/** 검색 결과 화면 주소 */
export function searchPath(item: RecentSearch) {
  return item.type === 'keyword'
    ? `/search?keyword=${encodeURIComponent(item.keyword)}`
    : `/search?categoryId=${item.categoryId}&category=${encodeURIComponent(item.name)}`;
}
