import { useSearchParams } from 'react-router';
import type { SearchScope, SearchSort } from '../../api/restaurants';
import { SearchHome } from './SearchHome';
import { SearchResults } from './SearchResults';

const SORTS: SearchSort[] = ['LOCAL_POPULAR', 'REVISIT', 'DISTANCE'];

/**
 * 맛집 검색 /search
 * - 조건이 없으면 검색 홈 (SEARCH-01)
 * - ?keyword= 또는 ?categoryId=&category=이름 이면 검색 결과 (SEARCH-02). &sort= &scope=SIGUNGU
 */
export function SearchPage() {
  const [params] = useSearchParams();
  const keyword = params.get('keyword')?.trim() || null;
  const categoryId = Number(params.get('categoryId')) || null;
  const sortParam = params.get('sort') as SearchSort | null;
  const sort = sortParam && SORTS.includes(sortParam) ? sortParam : 'LOCAL_POPULAR';
  const scope: SearchScope = params.get('scope') === 'SIGUNGU' ? 'SIGUNGU' : 'DONG';

  if (!keyword && !categoryId) return <SearchHome />;
  return (
    <SearchResults
      keyword={keyword}
      categoryId={categoryId}
      categoryName={params.get('category')}
      sort={sort}
      scope={scope}
    />
  );
}
