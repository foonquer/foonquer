import { z } from 'zod';

// 명세서 "페이지네이션": page(1부터), size(기본 20, 최대 50) → items, page, size, totalCount, hasNext

export const MAX_PAGE_SIZE = 50;

/** 목록 API query 스키마에 펼쳐 넣는다. 예) z.object({ ...pageQuery, keyword: z.string() }) */
export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
};

export interface PageResult<T> {
  items: T[];
  page: number;
  size: number;
  totalCount: number;
  hasNext: boolean;
}

export function toPageResult<T>(
  items: T[],
  { page, size, totalCount }: { page: number; size: number; totalCount: number },
): PageResult<T> {
  return { items, page, size, totalCount, hasNext: page * size < totalCount };
}

/** 이미 정렬된 배열에서 한 페이지를 자른다 */
export function slicePage<T>(all: T[], page: number, size: number): T[] {
  const start = (page - 1) * size;
  return all.slice(start, start + size);
}
