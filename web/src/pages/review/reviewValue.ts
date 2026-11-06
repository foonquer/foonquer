// 세부평가 입력 값과 서버로 보낼 값 (REVIEW-02·06)

import type { DetailScores } from '../../api/reviews';
import { uploadImage } from '../../api/uploads';

export const CONTENT_MAX = 300;
export const PHOTO_MAX = 5;

export type Photo = { key: string | null; url: string; file?: File };

export type ReviewFormValue = {
  scores: Partial<DetailScores>;
  /** aspectId → G(좋았던 점) / B(아쉬웠던 점) */
  aspects: Record<number, 'G' | 'B'>;
  content: string;
  photos: Photo[];
};

export const EMPTY_FORM: ReviewFormValue = { scores: {}, aspects: {}, content: '', photos: [] };

export const DETAIL_ITEMS: { key: keyof DetailScores; label: string }[] = [
  { key: 'cleanliness', label: '청결' },
  { key: 'portion', label: '양' },
  { key: 'service', label: '서비스' },
  { key: 'price', label: '가격 만족도' },
];

/** 네 항목을 모두 골랐으면 세부 별점, 하나도 안 골랐으면 null, 일부만이면 'PARTIAL' */
export function detailScoresOf(value: ReviewFormValue): DetailScores | null | 'PARTIAL' {
  const picked = DETAIL_ITEMS.filter((i) => value.scores[i.key] !== undefined).length;
  if (picked === 0) return null;
  if (picked < DETAIL_ITEMS.length) return 'PARTIAL';
  return value.scores as DetailScores;
}

export function aspectsOf(value: ReviewFormValue) {
  return Object.entries(value.aspects).map(([aspectId, polarity]) => ({
    aspectId: Number(aspectId),
    polarity,
  }));
}

/** 새로 고른 사진은 올리고, 있던 사진은 key 그대로 (순서 유지) */
export async function photoKeysOf(photos: Photo[]) {
  const keys: string[] = [];
  for (const photo of photos) {
    keys.push(photo.key ?? (await uploadImage(photo.file as File, 'REVIEW')));
  }
  return keys;
}

/** 공개 사진 주소에서 스토리지 key를 꺼낸다 (서버가 key 앞에 공개 주소를 붙여서 준다. 리뷰 사진 key는 review/로 시작) */
export function keyFromImageUrl(url: string) {
  const at = url.indexOf('/review/');
  return at < 0
    ? null
    : url
        .slice(at + 1)
        .split('/')
        .map(decodeURIComponent)
        .join('/');
}

/** 세부평가를 남긴 뒤 적립 완료 화면에 넘기는 값 */
export type RewardState = {
  restaurantName: string;
  point: number;
  parts: { scores: boolean; content: boolean; photos: boolean };
};
