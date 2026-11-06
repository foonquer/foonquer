import { defineErrors, type ErrorCodeDef } from '../../common/errors/error-codes';

// 코드 이름·상태·문구는 API 명세서 MAP-01·02, REST-01, SEARCH-01·02, RECO-01의 Error 항목을 그대로 옮겼다.

export const RestaurantError = defineErrors({
  RESTAURANT_NOT_FOUND: {
    status: 404,
    code: 'RESTAURANT_NOT_FOUND',
    message: '가게를 찾을 수 없어요.',
  },
  INVALID_CATEGORY: { status: 400, code: 'INVALID_CATEGORY', message: '없는 카테고리예요.' },

  // 지도 (MAP-01)
  INVALID_MAP_BOUNDS: {
    status: 400,
    code: 'INVALID_MAP_BOUNDS',
    message: '지도 영역 값이 올바르지 않아요.',
  },
  MAP_BOUNDS_TOO_LARGE: {
    status: 400,
    code: 'MAP_BOUNDS_TOO_LARGE',
    message: '지도를 더 확대해 주세요.',
  },

  // 검색·추천 (SEARCH-02, RECO-01)
  SEARCH_CONDITION_REQUIRED: {
    status: 400,
    code: 'SEARCH_CONDITION_REQUIRED',
    message: '검색어나 카테고리를 골라 주세요.',
  },
  INVALID_SORT: { status: 400, code: 'INVALID_SORT', message: '정렬·범위 값이 올바르지 않아요.' },
  INVALID_SCOPE: {
    status: 400,
    code: 'INVALID_SCOPE',
    message: '정렬·범위 값이 올바르지 않아요.',
  },
  LOCATION_REQUIRED: {
    status: 400,
    code: 'LOCATION_REQUIRED',
    message: '가까운 순으로 보려면 위치가 필요해요.',
  },
  INVALID_RECOMMENDATION_TYPE: {
    status: 400,
    code: 'INVALID_RECOMMENDATION_TYPE',
    message: '추천 기준이 올바르지 않아요.',
  },
});

/**
 * KEYWORD_TOO_LONG은 REGION-01(20자)과 SEARCH-02(30자)가 같은 코드를 다른 문구로 쓴다.
 * 등록된 코드는 하나의 문구만 가지므로(zod 메시지 연결용) SEARCH-02 쪽은 등록하지 않고 서비스에서 직접 던진다.
 */
export const SEARCH_KEYWORD_TOO_LONG: ErrorCodeDef = {
  status: 400,
  code: 'KEYWORD_TOO_LONG',
  message: '검색어는 30자 이내로 입력해 주세요.',
};
