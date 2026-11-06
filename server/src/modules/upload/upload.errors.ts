import { defineErrors } from '../../common/errors/error-codes';

/** UPLOAD-01 공통 사진 업로드와, 올린 사진 key를 받는 API(리뷰·방문 인증·문의) 공통 에러 */
export const UploadError = defineErrors({
  INVALID_UPLOAD_PURPOSE: {
    status: 400,
    code: 'INVALID_UPLOAD_PURPOSE',
    message: '어디에 쓸 사진인지 골라 주세요.',
  },
  UNSUPPORTED_IMAGE_TYPE: {
    status: 400,
    code: 'UNSUPPORTED_IMAGE_TYPE',
    message: 'JPG, PNG, WEBP 사진만 올릴 수 있어요.',
  },
  IMAGE_TOO_LARGE: {
    status: 400,
    code: 'IMAGE_TOO_LARGE',
    message: '10MB 이하 사진만 올릴 수 있어요.',
  },
  IMAGE_NOT_UPLOADED: {
    status: 400,
    code: 'IMAGE_NOT_UPLOADED',
    message: '올린 사진을 찾을 수 없어요. 다시 올려 주세요.',
  },
  IMAGE_KEY_FORBIDDEN: {
    status: 403,
    code: 'IMAGE_KEY_FORBIDDEN',
    message: '내가 올린 사진만 쓸 수 있어요.',
  },
  UPLOAD_URL_FAILED: {
    status: 500,
    code: 'UPLOAD_URL_FAILED',
    message: '사진을 올릴 준비를 하지 못했어요. 잠시 후 다시 시도해 주세요.',
  },
});
