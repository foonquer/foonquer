import { randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors/app-error';
import { IMAGE_CONTENT_TYPES } from '../../lib/image-file';
import { createUploadUrl } from '../../lib/storage';
import { UPLOAD_MAX_BYTES, UPLOAD_PURPOSES, UPLOAD_URL_EXPIRES_IN } from './upload-purpose';
import type { UploadUrlBody } from './upload.schema';
import { UploadError } from './upload.errors';

/** UPLOAD-01 사진 업로드 URL 발급. DB는 바꾸지 않는다. 받은 imageKey를 리뷰·인증·문의 API에 보낸다 */
export async function issueUploadUrl(userId: bigint, body: UploadUrlBody) {
  const { folder, bucket } = UPLOAD_PURPOSES[body.purpose];
  const imageKey = `${folder}/${userId.toString()}/${randomUUID()}.${IMAGE_CONTENT_TYPES[body.contentType]}`;
  let upload;
  try {
    upload = await createUploadUrl(
      imageKey,
      body.contentType,
      UPLOAD_MAX_BYTES,
      UPLOAD_URL_EXPIRES_IN,
      bucket,
    );
  } catch (err) {
    console.error('사진 업로드 URL 생성 실패', err);
    throw new AppError(UploadError.UPLOAD_URL_FAILED);
  }
  // 버킷 환경변수가 없으면(로컬 등) 올릴 곳이 없다
  if (!upload) throw new AppError(UploadError.UPLOAD_URL_FAILED);
  return {
    uploadUrl: upload.url,
    method: 'PUT' as const,
    headers: upload.headers,
    imageKey,
    expiresIn: UPLOAD_URL_EXPIRES_IN,
  };
}
