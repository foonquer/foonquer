import { defineErrors } from '../../common/errors/error-codes';

export const ReviewError = defineErrors({
  REVIEW_NOT_FOUND: { status: 404, code: 'REVIEW_NOT_FOUND', message: '리뷰를 찾을 수 없어요.' },
  INVALID_OVERALL_SCORE: {
    status: 400,
    code: 'INVALID_OVERALL_SCORE',
    message: '종합 별점은 0.5점부터 5점까지 0.5점 단위로 골라 주세요.',
  },
  INVALID_DETAIL_SCORES: {
    status: 400,
    code: 'INVALID_DETAIL_SCORES',
    message: '세부 별점은 다섯 항목 모두 1~5점으로 골라 주세요.',
  },
  INVALID_ASPECT: {
    status: 400,
    code: 'INVALID_ASPECT',
    message: '좋았던 점·아쉬웠던 점을 다시 골라 주세요.',
  },
  REVIEW_CONTENT_TOO_LONG: {
    status: 400,
    code: 'REVIEW_CONTENT_TOO_LONG',
    message: '리뷰는 300자까지 쓸 수 있어요.',
  },
  TOO_MANY_IMAGES: {
    status: 400,
    code: 'TOO_MANY_IMAGES',
    message: '사진은 5장까지 올릴 수 있어요.',
  },
  REVIEW_DETAIL_EMPTY: {
    status: 400,
    code: 'REVIEW_DETAIL_EMPTY',
    message: '세부 별점, 좋았던 점, 리뷰, 사진 중 하나는 남겨 주세요.',
  },
  ALREADY_RATED: {
    status: 409,
    code: 'ALREADY_RATED',
    message: '이미 별점을 남긴 방문이에요.',
  },
  VISIT_NOT_VERIFIED: {
    status: 409,
    code: 'VISIT_NOT_VERIFIED',
    message: '방문 인증을 마친 뒤에 별점을 남길 수 있어요.',
  },
  RATING_REQUIRED: {
    status: 409,
    code: 'RATING_REQUIRED',
    message: '종합 별점을 먼저 남겨 주세요.',
  },
  REVIEW_DETAIL_EXISTS: {
    status: 409,
    code: 'REVIEW_DETAIL_EXISTS',
    message: '이미 세부평가를 남겼어요. 내 리뷰에서 수정해 주세요.',
  },
  OWN_REVIEW: { status: 403, code: 'OWN_REVIEW', message: '내 리뷰에는 누를 수 없어요.' },
  VISIT_REQUIRED: {
    status: 403,
    code: 'VISIT_REQUIRED',
    message: '이 가게를 방문 인증한 탐험가만 누를 수 있어요.',
  },
  INVALID_REACTION: {
    status: 400,
    code: 'INVALID_REACTION',
    message: '도움돼요 또는 별로예요를 골라 주세요.',
  },
  INVALID_REVIEW_SORT: {
    status: 400,
    code: 'INVALID_REVIEW_SORT',
    message: '정렬 값이 올바르지 않아요.',
  },
  NO_FIELDS_TO_UPDATE: { status: 400, code: 'NO_FIELDS_TO_UPDATE', message: '바꿀 항목이 없어요.' },
});
