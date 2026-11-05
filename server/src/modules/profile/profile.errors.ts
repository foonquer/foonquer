import { defineErrors } from '../../common/errors/error-codes';

export const ProfileError = defineErrors({
  TOO_MANY_PICKS: {
    status: 400,
    code: 'TOO_MANY_PICKS',
    message: 'PICK은 10곳까지 고를 수 있어요.',
  },
  PICK_NOT_CONQUERED: {
    status: 400,
    code: 'PICK_NOT_CONQUERED',
    message: '내가 정복한 가게 중에서만 고를 수 있어요.',
  },
  PICK_DUPLICATE: {
    status: 400,
    code: 'PICK_DUPLICATE',
    message: '같은 가게를 두 번 고를 수 없어요.',
  },
  PICK_COMMENT_TOO_LONG: {
    status: 400,
    code: 'PICK_COMMENT_TOO_LONG',
    message: '한 줄 코멘트는 30자까지 쓸 수 있어요.',
  },
  CANNOT_REPORT_SELF: {
    status: 400,
    code: 'CANNOT_REPORT_SELF',
    message: '나 자신은 신고할 수 없어요.',
  },
  ALREADY_REPORTED: {
    status: 409,
    code: 'ALREADY_REPORTED',
    message: '이미 신고했어요. 확인 후 조치할게요.',
  },
  INVALID_REPORT: {
    status: 400,
    code: 'INVALID_REPORT',
    message: '신고 대상과 사유를 확인해 주세요.',
  },
  REPORT_DETAIL_TOO_LONG: {
    status: 400,
    code: 'REPORT_DETAIL_TOO_LONG',
    message: '자세한 내용은 200자까지 쓸 수 있어요.',
  },
  REPORT_TARGET_NOT_FOUND: {
    status: 404,
    code: 'REPORT_TARGET_NOT_FOUND',
    message: '신고할 대상을 찾을 수 없어요.',
  },
  CANNOT_BLOCK_SELF: {
    status: 400,
    code: 'CANNOT_BLOCK_SELF',
    message: '나 자신은 차단할 수 없어요.',
  },
});
