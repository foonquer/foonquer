import { defineErrors, type ErrorCodeDef } from '../../common/errors/error-codes';

// 코드 이름·상태·문구는 API 명세서 USER-01~07, LOCAL-01~03, SET-02·04의 Error 항목을 그대로 옮겼다.

export const UserError = defineErrors({
  NICKNAME_REQUIRED: { status: 400, code: 'NICKNAME_REQUIRED', message: '닉네임을 입력해 주세요.' },
  INVALID_NICKNAME: {
    status: 400,
    code: 'INVALID_NICKNAME',
    message: '닉네임은 2~10자 한글·영문·숫자로 입력해 주세요.',
  },
  INVALID_GENDER: { status: 400, code: 'INVALID_GENDER', message: '성별과 나이대를 골라 주세요.' },
  INVALID_AGE_GROUP: {
    status: 400,
    code: 'INVALID_AGE_GROUP',
    message: '성별과 나이대를 골라 주세요.',
  },
  LOCAL_REGION_COUNT_INVALID: {
    status: 400,
    code: 'LOCAL_REGION_COUNT_INVALID',
    message: '내 동네는 1~2곳 골라 주세요.',
  },
  PREFERRED_CATEGORY_INVALID: {
    status: 400,
    code: 'PREFERRED_CATEGORY_INVALID',
    message: '좋아하는 음식을 1개 이상 골라 주세요.',
  },
  LOCAL_REGION_DUPLICATE_INPUT: {
    status: 400,
    code: 'LOCAL_REGION_DUPLICATE',
    message: '같은 동네를 두 번 고를 수 없어요.',
  },
  PROFILE_IMAGE_NOT_FOUND: {
    status: 400,
    code: 'PROFILE_IMAGE_NOT_FOUND',
    message: '올린 사진을 찾을 수 없어요. 다시 올려 주세요.',
  },
  PROFILE_ALREADY_COMPLETED: {
    status: 409,
    code: 'PROFILE_ALREADY_COMPLETED',
    message: '이미 프로필을 설정했어요.',
  },
  NICKNAME_DUPLICATE: {
    status: 409,
    code: 'NICKNAME_DUPLICATE',
    message: '이미 누군가 쓰고 있어요. 다른 이름은 어때요?',
  },
  NO_FIELDS_TO_UPDATE: { status: 400, code: 'NO_FIELDS_TO_UPDATE', message: '바꿀 항목이 없어요.' },
  NICKNAME_CHANGE_TOO_SOON: {
    status: 409,
    code: 'NICKNAME_CHANGE_TOO_SOON',
    message: '닉네임은 30일에 한 번 바꿀 수 있어요.',
  },

  // 내 동네 (LOCAL-02·03)
  REGION_ID_REQUIRED: {
    status: 400,
    code: 'REGION_ID_REQUIRED',
    message: '추가할 동네를 골라 주세요.',
  },
  LOCAL_REGION_LIMIT_EXCEEDED: {
    status: 409,
    code: 'LOCAL_REGION_LIMIT_EXCEEDED',
    message: '내 동네는 최대 2곳까지 고를 수 있어요.',
  },
  LOCAL_REGION_CHANGE_LIMITED: {
    status: 409,
    code: 'LOCAL_REGION_CHANGE_LIMITED',
    message: '내 동네는 한 시즌에 한 번만 바꿀 수 있어요.',
  },
  LOCAL_REGION_NOT_FOUND: {
    status: 404,
    code: 'LOCAL_REGION_NOT_FOUND',
    message: '내 동네에서 찾을 수 없어요.',
  },
  LOCAL_REGION_MIN_REQUIRED: {
    status: 409,
    code: 'LOCAL_REGION_MIN_REQUIRED',
    message: '내 동네는 최소 1곳 있어야 해요.',
  },

  // 프로필 사진 (USER-02·06·07)
  UNSUPPORTED_IMAGE_TYPE: {
    status: 400,
    code: 'UNSUPPORTED_IMAGE_TYPE',
    message: 'JPG, PNG, WEBP 사진만 올릴 수 있어요.',
  },
  IMAGE_TOO_LARGE: {
    status: 400,
    code: 'IMAGE_TOO_LARGE',
    message: '5MB 이하 사진만 올릴 수 있어요.',
  },
  UPLOAD_URL_FAILED: {
    status: 500,
    code: 'UPLOAD_URL_FAILED',
    message: '업로드를 준비하지 못했어요.',
  },
  IMAGE_KEY_REQUIRED: { status: 400, code: 'IMAGE_KEY_REQUIRED', message: '사진 정보가 필요해요.' },
  IMAGE_KEY_FORBIDDEN: {
    status: 403,
    code: 'IMAGE_KEY_FORBIDDEN',
    message: '내가 올린 사진이 아니에요.',
  },

  // 회원 탈퇴 (SET-04)
  WITHDRAWAL_CONFIRM_REQUIRED: {
    status: 400,
    code: 'WITHDRAWAL_CONFIRM_REQUIRED',
    message: '안내를 모두 확인해 주세요.',
  },
  INVALID_WITHDRAWAL_REASON: {
    status: 400,
    code: 'INVALID_WITHDRAWAL_REASON',
    message: '떠나는 이유가 올바르지 않아요.',
  },
  REASON_DETAIL_TOO_LONG: {
    status: 400,
    code: 'REASON_DETAIL_TOO_LONG',
    message: '255자 이내로 입력해 주세요.',
  },
  MEMBER_ALREADY_WITHDRAWN: {
    status: 409,
    code: 'MEMBER_ALREADY_WITHDRAWN',
    message: '이미 탈퇴한 계정이에요.',
  },
});

/**
 * 명세서에서 LOCAL_REGION_DUPLICATE는 USER-03(입력 안에서 중복, 400)과 LOCAL-02(이미 내 동네, 409)가
 * 같은 코드를 다른 상태로 쓴다. defineErrors()는 같은 코드를 다른 상태로 두 번 등록하지 못하게 막으므로
 * 409 쪽은 등록하지 않고 따로 둔다 (zod 메시지로는 400 쪽이 쓰인다).
 */
export const LOCAL_REGION_ALREADY_ADDED: ErrorCodeDef = {
  status: 409,
  code: 'LOCAL_REGION_DUPLICATE',
  message: '이미 내 동네에 있는 동네예요.',
};
