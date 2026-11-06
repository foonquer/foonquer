import type { RecommendationType } from '../../api/restaurants';

export const RECO_OPTIONS = [
  { value: 'LOCAL_POPULAR', label: '현지인 인기' },
  { value: 'REVISIT', label: '재방문 많음' },
  { value: 'RATING', label: '평점 높은 집' },
] as const;

/** 추천 카드 위 한 줄 */
export const RECO_REASON: Record<RecommendationType, string> = {
  LOCAL_POPULAR: '동네 주민이 자주 찾는 곳',
  REVISIT: '동네 주민이 자주 다시 찾는 곳',
  RATING: '방문 인증 평점이 높은 곳',
};

/** 추천할 곳이 없을 때 안내 (서버 기준과 같다) */
export const RECO_EMPTY: Record<RecommendationType, string> = {
  LOCAL_POPULAR: '동네 주민이 방문 인증한 가게가 생기면 보여 드려요.',
  REVISIT: '방문한 사람이 5명 넘는 가게부터 재방문율로 골라요.',
  RATING: '인증 평가가 5개 넘는 가게부터 평점으로 골라요.',
};

export function parseRecoType(value: string | null): RecommendationType {
  return value === 'REVISIT' || value === 'RATING' ? value : 'LOCAL_POPULAR';
}
