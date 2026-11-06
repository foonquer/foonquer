import type { BucketKind } from '../../lib/storage';

/**
 * UPLOAD-01 purpose별 key 폴더와 버킷 (명세서 "값 규칙": 리뷰 사진은 공개 URL, 영수증·현장·문의 사진은 signed URL).
 * 프로필 사진은 USER-02(profile/ 폴더)를 그대로 쓴다.
 */
export const UPLOAD_PURPOSES = {
  REVIEW: { folder: 'review', bucket: 'public' },
  RECEIPT: { folder: 'receipt', bucket: 'private' },
  SITE_PHOTO: { folder: 'site', bucket: 'private' },
  INQUIRY: { folder: 'inquiry', bucket: 'private' },
} as const satisfies Record<string, { folder: string; bucket: BucketKind }>;

export type UploadPurpose = keyof typeof UPLOAD_PURPOSES;

/** 한 장 최대 크기 (명세서 CS-04 "장당 10MB") */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
/** 업로드 URL 유효 시간(초) */
export const UPLOAD_URL_EXPIRES_IN = 300;
