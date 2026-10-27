import { defineErrors } from '../../common/errors/error-codes';

// REGION-01·02와 지역을 받는 API(USER-03, LOCAL-02, SEARCH, RECO) 공통

export const RegionError = defineErrors({
  REGION_NOT_FOUND: { status: 404, code: 'REGION_NOT_FOUND', message: '동네를 찾을 수 없어요.' },
  REGION_NOT_DONG: { status: 400, code: 'REGION_NOT_DONG', message: '동 단위로 골라 주세요.' },
  REGION_NOT_SUPPORTED: {
    status: 400,
    code: 'REGION_NOT_SUPPORTED',
    message: '지금은 서울 동네만 고를 수 있어요.',
  },
  KEYWORD_REQUIRED: { status: 400, code: 'KEYWORD_REQUIRED', message: '동 이름을 입력해 주세요.' },
  KEYWORD_TOO_LONG: {
    status: 400,
    code: 'KEYWORD_TOO_LONG',
    message: '20자 이내로 입력해 주세요.',
  },
  INVALID_COORDINATE: {
    status: 400,
    code: 'INVALID_COORDINATE',
    message: '위치 값이 올바르지 않아요.',
  },
});
