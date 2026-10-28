// 지도·가게·검색·추천 API (MAP-01·02, REST-01, SEARCH-01·02, RECO-01)

import { api } from '../lib/api';

export type ConquestState = 'CONQUERED' | 'MOVING' | 'NOT_CONQUERED';

export type Rating = { score: number | null; reviewCount: number };

export type BusinessStatus = {
  isOpen: boolean;
  todayOpenTime: string | null;
  todayCloseTime: string | null;
};

export type Bounds = { swLat: number; swLng: number; neLat: number; neLng: number };

/** 지도·목록 정렬과 거리 계산에 쓰는 내 위치 (없으면 거리를 빼고 받는다) */
export type Coords = { lat: number; lng: number };

/** MAP-01 지도 핀 */
export type MapRestaurant = {
  restaurantId: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  lat: number;
  lng: number;
  conquestState: ConquestState;
  conqueredInPastSeason: boolean;
  isSaved: boolean;
};

export const getMapRestaurants = (bounds: Bounds, signal?: AbortSignal) =>
  api.get<{ items: MapRestaurant[]; totalCount: number; truncated: boolean; kakaoSynced: boolean }>(
    '/map/restaurants',
    bounds,
    signal,
  );

/** MAP-02 가게 미리보기 */
export type RestaurantPreview = {
  restaurantId: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  sigunguName: string | null;
  dongName: string | null;
  distanceM: number | null;
  rating: Rating;
  businessStatus: BusinessStatus | null;
  currentSeasonConquerorCount: number;
  conquestState: ConquestState;
  conqueredInPastSeason: boolean;
  isSaved: boolean;
  myConquest: {
    conqueredAt: string;
    myScore: number | null;
    revisitIntent: boolean | null;
    hasTextReview: boolean;
    reviewId: number | null;
  } | null;
  moving: { visitId: number; verifiedAt: string } | null;
};

export const getRestaurantPreview = (restaurantId: number, coords?: Coords | null) =>
  api.get<RestaurantPreview>(`/restaurants/${restaurantId}/preview`, coords ?? undefined);

/** REST-01 음식점 상세 */
export type RestaurantDetail = {
  restaurantId: number;
  kakaoPlaceId: string | null;
  name: string;
  /** A 영업 / C 폐업 */
  status: 'A' | 'C';
  categoryId: number | null;
  categoryName: string | null;
  kakaoCategoryName: string | null;
  phone: string | null;
  roadAddress: string | null;
  jibunAddress: string | null;
  sigunguName: string | null;
  dongName: string | null;
  lat: number;
  lng: number;
  distanceM: number | null;
  kakaoPlaceUrl: string | null;
  businessHours: Record<string, { open: string; close: string }[]> | null;
  businessStatus: BusinessStatus | null;
  rating: Rating;
  stats: {
    taste: number | null;
    cleanliness: number | null;
    portion: number | null;
    service: number | null;
    price: number | null;
    revisitIntentRate: number | null;
    localVisitRate: number | null;
    revisitRate: number | null;
    textReviewCount: number;
    photoReviewCount: number;
    visitCount: number;
    currentSeasonConquerorCount: number;
  };
  my: {
    conquestState: ConquestState;
    conqueredInPastSeason: boolean;
    conqueredAt: string | null;
    myScore: number | null;
    myReviewId: number | null;
    movingVisitId: number | null;
    isSaved: boolean;
  };
};

export const getRestaurant = (restaurantId: number, coords?: Coords | null) =>
  api.get<RestaurantDetail>(`/restaurants/${restaurantId}`, coords ?? undefined);

/** SEARCH-01 검색 홈 (음식 종류 12개와 동네별 가게 수) */
export type Category = { categoryId: number; name: string; restaurantCount: number };

export const getSearchHome = (regionId: number) =>
  api.get<{
    region: { regionId: number; dongName: string; sigunguId: number; sigunguName: string };
    categories: Category[];
  }>('/search/home', { regionId });

/** SEARCH-02·RECO-01 목록 카드 */
export type RestaurantCardItem = {
  restaurantId: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  distanceM: number | null;
  rating: Rating;
  revisitRate: number | null;
  localVisitRate: number | null;
  conquestState: ConquestState;
};

export type SearchSort = 'LOCAL_POPULAR' | 'REVISIT' | 'DISTANCE';
export type SearchScope = 'DONG' | 'SIGUNGU';

export type SearchResult = {
  items: (RestaurantCardItem & {
    matchedBy: 'NAME' | 'MENU' | null;
    matchedMenuName: string | null;
  })[];
  page: number;
  size: number;
  totalCount: number;
  hasNext: boolean;
  emptyGuide: { canSearchSigungu: boolean; similarKeywords: string[] } | null;
};

/** SEARCH-02 키워드·음식 종류 검색. 결과가 없을 때 서버 문구도 쓰려고 message까지 받는다 */
export const searchRestaurants = (query: {
  keyword?: string;
  categoryId?: number;
  regionId: number;
  scope: SearchScope;
  sort: SearchSort;
  lat?: number;
  lng?: number;
  page?: number;
  size?: number;
}) => api.call<SearchResult>('GET', '/restaurants/search', { query });

/** RECO-01 추천 맛집 */
export type RecommendationType = 'LOCAL_POPULAR' | 'REVISIT' | 'RATING';

export type RecommendationItem = RestaurantCardItem & { rank: number; visitorCount: number };

export const getRecommendations = (query: {
  type: RecommendationType;
  regionId: number;
  categoryId?: number;
  lat?: number;
  lng?: number;
  page?: number;
  size?: number;
}) =>
  api.get<{
    type: RecommendationType;
    region: {
      regionId: number;
      level: number;
      dongName: string | null;
      sigunguId: number;
      sigunguName: string;
    };
    items: RecommendationItem[];
    page: number;
    size: number;
    totalCount: number;
    hasNext: boolean;
  }>('/recommendations', query);
