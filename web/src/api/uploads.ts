// 사진 올리기 (UPLOAD-01로 주소를 받아 브라우저에서 스토리지에 바로 PUT)

import { api, ApiError } from '../lib/api';

export type UploadPurpose = 'REVIEW' | 'RECEIPT' | 'SITE_PHOTO' | 'INQUIRY';

type UploadUrl = {
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  imageKey: string;
  expiresIn: number;
};

/** 서버가 받는 사진 형식 (영수증은 OCR이 WebP를 못 읽어서 JPG·PNG만) */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const RECEIPT_ACCEPT = 'image/jpeg,image/png';
/** 한 장 최대 크기 (서버 UPLOAD_MAX_BYTES와 같다) */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** 사진을 올리고 imageKey를 돌려준다. 이 key를 인증·리뷰·문의 API에 보낸다 */
export async function uploadImage(file: File, purpose: UploadPurpose): Promise<string> {
  const accept = (purpose === 'RECEIPT' ? RECEIPT_ACCEPT : IMAGE_ACCEPT).split(',');
  if (!accept.includes(file.type)) {
    throw new ApiError(
      400,
      'UNSUPPORTED_IMAGE_TYPE',
      purpose === 'RECEIPT'
        ? '영수증은 JPG, PNG 사진만 올릴 수 있어요.'
        : 'JPG, PNG, WebP 사진만 올릴 수 있어요.',
    );
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    throw new ApiError(400, 'IMAGE_TOO_LARGE', '사진은 한 장에 10MB까지 올릴 수 있어요.');
  }
  const target = await api.post<UploadUrl>('/uploads/signed-url', {
    purpose,
    contentType: file.type,
    fileSize: file.size,
  });
  let res: Response;
  try {
    res = await fetch(target.uploadUrl, { method: 'PUT', headers: target.headers, body: file });
  } catch {
    throw new ApiError(0, 'NETWORK', '사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  if (!res.ok) {
    throw new ApiError(res.status, 'UPLOAD_FAILED', '사진을 올리지 못했어요. 다시 시도해 주세요.');
  }
  return target.imageKey;
}
