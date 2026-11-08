import { defineErrors } from '../../common/errors/error-codes';

// VISIT-01~04, REVIEW-01·02 (방문 인증 상태)
export const VisitError = defineErrors({
  VISIT_NOT_FOUND: {
    status: 404,
    code: 'VISIT_NOT_FOUND',
    message: '방문 인증 기록을 찾을 수 없어요.',
  },
  VISIT_TOO_FAR: {
    status: 422,
    code: 'VISIT_TOO_FAR',
    message: '가게에서 너무 멀어요. 매장 안이나 바로 앞에서 다시 확인해 주세요.',
  },
  VISIT_PENDING_RATING: {
    status: 409,
    code: 'VISIT_PENDING_RATING',
    message: '이 가게는 별점을 남기면 정복이 끝나요. 먼저 별점을 남겨 주세요.',
  },
  ALREADY_VERIFIED_TODAY: {
    status: 409,
    code: 'ALREADY_VERIFIED_TODAY',
    message: '오늘은 이미 이 가게를 인증했어요. 내일 다시 인증할 수 있어요.',
  },
  LOCATION_CHECK_EXPIRED: {
    status: 409,
    code: 'LOCATION_CHECK_EXPIRED',
    message: '위치 확인 후 2시간이 지났어요. 위치를 다시 확인해 주세요.',
  },
  INVALID_VISIT_STATE: {
    status: 409,
    code: 'INVALID_VISIT_STATE',
    message: '지금 단계에서는 할 수 없어요. 인증 상태를 다시 확인해 주세요.',
  },
  PHOTO_MISMATCH: {
    status: 422,
    code: 'PHOTO_MISMATCH',
    message: '사진을 찍은 장소나 시간이 맞지 않아요. 이 가게에서 찍은 음식 사진을 골라 주세요.',
  },
  INVALID_COORDINATE: {
    status: 400,
    code: 'INVALID_COORDINATE',
    message: '위치 값이 올바르지 않아요.',
  },
  RESTAURANT_NOT_CANDIDATE: {
    status: 400,
    code: 'RESTAURANT_NOT_CANDIDATE',
    message: '영수증과 맞는 가게만 고를 수 있어요.',
  },
});

/** visit.fail_reason → 화면 문구 */
export const FAIL_MESSAGES: Record<string, string> = {
  UNREADABLE: '영수증을 읽기 어려워요. 밝은 곳에서 영수증 전체가 보이게 다시 찍어 주세요.',
  DUPLICATE: '이미 인증한 영수증이에요.',
  ALREADY_VERIFIED: '이 가게는 오늘 이미 인증했거나, 별점을 남기지 않은 인증이 있어요.',
  STORE_NOT_FOUND: '영수증의 가게를 찾지 못했어요. 가게를 골라서 다시 인증해 주세요.',
  STORE_MISMATCH: '영수증의 가게 정보가 달라요. 인증할 가게가 맞는지 확인해 주세요.',
  EXPIRED: '결제한 지 7일이 지난 영수증은 인증할 수 없어요.',
  TOO_FAR: '가게에서 너무 멀어요.',
  PHOTO_UNCLEAR: '음식이 잘 보이지 않아요.',
  PHOTO_MISMATCH: '사진의 위치·촬영 시간이 맞지 않아요.',
};
