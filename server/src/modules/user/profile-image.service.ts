import { randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors/app-error';
import { type ImageExt, isImageOf, MAGIC_BYTES } from '../../lib/image-file';
import { publicImageUrl } from '../../lib/image-url';
import { prisma } from '../../lib/prisma';
import { createUploadUrl, deleteObjectQuietly, readObjectHead } from '../../lib/storage';
import { UserError } from './user.errors';
import {
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_TYPES,
  type ProfileImageUploadBody,
} from './user.schema';

/** USER-02 업로드 URL 유효 시간(초) */
const UPLOAD_URL_EXPIRES_IN = 300;

/** 프로필 사진 key 형식: profile/{회원 id}/{uuid}.{jpg|png|webp} */
const PROFILE_KEY = /^profile\/(\d+)\/[0-9a-fA-F-]{36}\.(jpg|png|webp)$/;

/**
 * 올린 프로필 사진 key를 확인한다 (USER-03·06 공통).
 * 다른 회원 폴더면 403 IMAGE_KEY_FORBIDDEN(forbidOthers일 때), 형식이 틀리거나 파일이 없으면 400 PROFILE_IMAGE_NOT_FOUND,
 * 올린 파일이 확장자와 다른(이미지가 아닌) 파일이면 지우고 400 UNSUPPORTED_IMAGE_TYPE.
 */
export async function assertProfileImage(userId: bigint, key: string, forbidOthers = false) {
  const match = PROFILE_KEY.exec(key);
  if (match && match[1] !== userId.toString()) {
    throw new AppError(
      forbidOthers ? UserError.IMAGE_KEY_FORBIDDEN : UserError.PROFILE_IMAGE_NOT_FOUND,
    );
  }
  if (!match) throw new AppError(UserError.PROFILE_IMAGE_NOT_FOUND);
  const head = await readObjectHead(key, MAGIC_BYTES);
  if (!head) throw new AppError(UserError.PROFILE_IMAGE_NOT_FOUND);
  if (!isImageOf(match[2] as ImageExt, head)) {
    await deleteObjectQuietly(key);
    throw new AppError(UserError.UNSUPPORTED_IMAGE_TYPE);
  }
}

/** USER-02 프로필 사진 업로드 URL 발급. DB는 바꾸지 않는다 */
export async function issueProfileImageUploadUrl(userId: bigint, body: ProfileImageUploadBody) {
  const imageKey = `profile/${userId.toString()}/${randomUUID()}.${PROFILE_IMAGE_TYPES[body.contentType]}`;
  let upload;
  try {
    upload = await createUploadUrl(
      imageKey,
      body.contentType,
      PROFILE_IMAGE_MAX_BYTES,
      UPLOAD_URL_EXPIRES_IN,
    );
  } catch (err) {
    console.error('프로필 사진 업로드 URL 생성 실패', err);
    throw new AppError(UserError.UPLOAD_URL_FAILED);
  }
  // GCS_BUCKET이 없으면(로컬 등) 올릴 곳이 없다
  if (!upload) throw new AppError(UserError.UPLOAD_URL_FAILED);
  return {
    uploadUrl: upload.url,
    method: 'PUT' as const,
    headers: upload.headers,
    imageKey,
    expiresIn: UPLOAD_URL_EXPIRES_IN,
  };
}

/** USER-06 프로필 사진 변경. 저장한 뒤 이전 파일을 지운다 */
export async function changeProfileImage(userId: bigint, imageKey: string) {
  await assertProfileImage(userId, imageKey, true);
  const before = await prisma.member.findUniqueOrThrow({
    where: { id: userId },
    select: { profileImageKey: true },
  });
  await prisma.member.update({ where: { id: userId }, data: { profileImageKey: imageKey } });
  if (before.profileImageKey !== imageKey) await deleteObjectQuietly(before.profileImageKey);
  return { profileImageUrl: publicImageUrl(imageKey), profileImageSource: 'CUSTOM' as const };
}

/** USER-07 프로필 사진 삭제 (먹깨비로 되돌림). 사진이 없어도 성공(멱등) */
export async function removeProfileImage(userId: bigint) {
  const before = await prisma.member.findUniqueOrThrow({
    where: { id: userId },
    select: { profileImageKey: true },
  });
  if (before.profileImageKey) {
    await prisma.member.update({ where: { id: userId }, data: { profileImageKey: null } });
    await deleteObjectQuietly(before.profileImageKey);
  }
  return { profileImageUrl: null, profileImageSource: 'DEFAULT' as const };
}
