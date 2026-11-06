import { AppError } from '../../common/errors/app-error';
import { type ImageExt, isImageOf, MAGIC_BYTES } from '../../lib/image-file';
import { deleteObjectQuietly, readObjectHead } from '../../lib/storage';
import { UPLOAD_PURPOSES, type UploadPurpose } from './upload-purpose';
import { UploadError } from './upload.errors';

const KEY_PATTERN = /^([a-z]+)\/(\d+)\/[0-9a-fA-F-]{36}\.(jpg|png|webp)$/;

/**
 * UPLOAD-01로 올린 사진 key를 확인한다 (리뷰·영수증·현장·문의 공통).
 * - 다른 회원 폴더면 403 IMAGE_KEY_FORBIDDEN
 * - 폴더·형식이 틀리거나 파일이 없으면 400 IMAGE_NOT_UPLOADED
 * - 확장자와 다른(이미지가 아닌) 파일이면 지우고 400 UNSUPPORTED_IMAGE_TYPE
 */
export async function assertUploadedImage(userId: bigint, purpose: UploadPurpose, key: string) {
  const { folder, bucket } = UPLOAD_PURPOSES[purpose];
  const match = KEY_PATTERN.exec(key);
  if (!match || match[1] !== folder) throw new AppError(UploadError.IMAGE_NOT_UPLOADED);
  if (match[2] !== userId.toString()) throw new AppError(UploadError.IMAGE_KEY_FORBIDDEN);

  const head = await readObjectHead(key, MAGIC_BYTES, bucket);
  if (!head) throw new AppError(UploadError.IMAGE_NOT_UPLOADED);
  if (!isImageOf(match[3] as ImageExt, head)) {
    await deleteObjectQuietly(key, bucket);
    throw new AppError(UploadError.UNSUPPORTED_IMAGE_TYPE);
  }
}

/** 여러 장을 한 번에 확인한다 (같은 key가 두 번 오면 400 VALIDATION_ERROR는 스키마에서 막는다) */
export async function assertUploadedImages(userId: bigint, purpose: UploadPurpose, keys: string[]) {
  for (const key of keys) await assertUploadedImage(userId, purpose, key);
}
