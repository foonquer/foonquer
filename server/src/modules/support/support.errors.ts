import { defineErrors } from '../../common/errors/error-codes';

export const SupportError = defineErrors({
  NOTICE_NOT_FOUND: {
    status: 404,
    code: 'NOTICE_NOT_FOUND',
    message: '공지사항을 찾을 수 없어요.',
  },
  INQUIRY_NOT_FOUND: { status: 404, code: 'INQUIRY_NOT_FOUND', message: '문의를 찾을 수 없어요.' },
  INVALID_INQUIRY_CATEGORY: {
    status: 400,
    code: 'INVALID_INQUIRY_CATEGORY',
    message: '문의 유형을 골라 주세요.',
  },
  INQUIRY_CONTENT_REQUIRED: {
    status: 400,
    code: 'INQUIRY_CONTENT_REQUIRED',
    message: '문의 내용을 1~1000자로 적어 주세요.',
  },
  INVALID_REF_VISIT: {
    status: 400,
    code: 'INVALID_REF_VISIT',
    message: '내 방문 인증 내역만 첨부할 수 있어요.',
  },
  INVALID_FAQ_CATEGORY: {
    status: 400,
    code: 'INVALID_FAQ_CATEGORY',
    message: 'FAQ 유형이 올바르지 않아요.',
  },
  TERMS_NOT_FOUND: { status: 404, code: 'TERMS_NOT_FOUND', message: '약관을 찾을 수 없어요.' },
});
