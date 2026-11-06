import { env } from '../config/env';

/**
 * 스토리지 key → 공개 조회 URL (프로필·리뷰 사진, Cloud Storage 공개 주소 또는 Cloud CDN).
 * 명세서 "값 규칙": DB에는 key만 두고 응답에서는 ...Url로 바꿔서 준다.
 * IMAGE_BASE_URL이 없으면(로컬 등) null을 준다 → 프론트는 기본 이미지(먹깨비)를 보여 준다.
 */
export function publicImageUrl(key: string | null | undefined): string | null {
  if (!key || !env.IMAGE_BASE_URL) return null;
  return `${env.IMAGE_BASE_URL}/${key.split('/').map(encodeURIComponent).join('/')}`;
}
