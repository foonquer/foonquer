// 지도·가게·검색·추천 API (MAP-01·02, REST-01, SEARCH-01·02, RECO-01)

import { api } from '../lib/api';

export type ConquestState = 'CONQUERED' | 'MOVING' | 'NOT_CONQUERED';

/** score: 맛 별점 — 신뢰도 가중 별점 R (리뷰가 없거나 아직 계산 전이면 null → "아직 별점이 없어요") */
export type Rating = { score: number | null; reviewCount: number };

export type TasteKey = 'taste' | 'cleanliness' | 'portion' | 'service' | 'price';

/** 내 종합 별점 = 항목 평균 × 내 취향 비중 (맛 별점이 없으면 score null) */
export type MyOverall = {
  score: number | null;
  items: { key: TasteKey; average: number | null; weightPercent: number | null }[];
};

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
  /** 내 종합 별점 ("★ 4.2 맛 · 내 종합 4.0") */
  myOverallScore: number | null;
  /** 마패: 뒷광고·리뷰 이벤트가 확인된 가게 */
  hasMapae: boolean;
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
  /** 항목별 평균의 "내 종합"과 계산 보기 시트 */
  myOverall: MyOverall;
  /** 마패: 뒷광고·리뷰 이벤트가 확인된 가게 → "리뷰 이벤트를 하는 가게입니다" */
  hasMapae: boolean;
  stats: {
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
  /** 내 종합 별점 ("★ 4.6 맛 · 내 종합 4.4") */
  myOverallScore: number | null;
  hasMapae: boolean;
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
    /** 좋아하는 음식(S-05-1) 가게를 먼저 보여 줬으면 그 카테고리 (카테고리를 골랐으면 빈 배열) */
    preferredCategories: { categoryId: number; categoryName: string }[];
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
