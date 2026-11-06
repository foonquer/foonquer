import { defineErrors } from '../../common/errors/error-codes';

// ADMIN-01~16 관리자 API
export const AdminError = defineErrors({
  REPORT_NOT_FOUND: { status: 404, code: 'REPORT_NOT_FOUND', message: '신고를 찾을 수 없어요.' },
  REPORT_ALREADY_PROCESSED: {
    status: 409,
    code: 'REPORT_ALREADY_PROCESSED',
    message: '이미 처리한 신고예요.',
  },
  INVALID_REPORT_ACTION: {
    status: 400,
    code: 'INVALID_REPORT_ACTION',
    message: '이 신고에는 할 수 없는 처리예요.',
  },
  MAPAE_NOT_FOUND: { status: 404, code: 'MAPAE_NOT_FOUND', message: '마패를 찾을 수 없어요.' },
  MAPAE_ALREADY_ACTIVE: {
    status: 409,
    code: 'MAPAE_ALREADY_ACTIVE',
    message: '이미 마패가 붙은 가게예요.',
  },
  MAPAE_ALREADY_RELEASED: {
    status: 409,
    code: 'MAPAE_ALREADY_RELEASED',
    message: '이미 해제한 마패예요.',
  },
  FAQ_NOT_FOUND: { status: 404, code: 'FAQ_NOT_FOUND', message: 'FAQ를 찾을 수 없어요.' },
  POLICY_VERSION_EXISTS: {
    status: 409,
    code: 'POLICY_VERSION_EXISTS',
    message: '이미 있는 약관 버전이에요.',
  },
  INVALID_MEMBER_STATUS: {
    status: 409,
    code: 'INVALID_MEMBER_STATUS',
    message: '활성 회원만 이용 정지할 수 있고, 이용 정지한 회원만 풀 수 있어요.',
  },
  CANNOT_SUSPEND_SELF: {
    status: 400,
    code: 'CANNOT_SUSPEND_SELF',
    message: '내 계정은 이용 정지할 수 없어요.',
  },
  INVALID_REVIEW_STATUS: {
    status: 409,
    code: 'INVALID_REVIEW_STATUS',
    message: '작성자가 지운 리뷰는 상태를 바꿀 수 없어요.',
  },
  NO_FIELDS_TO_UPDATE: { status: 400, code: 'NO_FIELDS_TO_UPDATE', message: '바꿀 항목이 없어요.' },
});
