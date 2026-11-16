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

/**
 * 세부 별점 4항목. texts는 1~5점에 맞춘 설명 (세부 별점 기준: 3점 = 기대한 만큼),
 * hint는 고르기 전에 보여 주는 무엇을 보는지
 */
export const DETAIL_ITEMS: {
  key: keyof DetailScores;
  label: string;
  hint: string;
  texts: [string, string, string, string, string];
}[] = [
  {
    key: 'cleanliness',
    label: '청결',
    hint: '매장·식기·화장실은 깨끗했나요?',
    texts: [
      '위생이 걱정될 만큼 지저분했어요',
      '테이블이나 식기에 아쉬운 데가 있었어요',
      '눈에 거슬리는 곳 없이 무난했어요',
      '전체적으로 깔끔해서 기분 좋았어요',
      '식기부터 화장실까지 반짝반짝했어요',
    ],
  },
  {
    key: 'portion',
    label: '양',
    hint: '값에 비해 든든했나요?',
    texts: [
      '한 끼를 더 먹어야 할 만큼 적었어요',
      '다 먹고도 조금 허전했어요',
      '딱 한 끼 든든하게 먹을 만큼이에요',
      '배부르게 먹고도 조금 남았어요',
      '둘이 나눠 먹어도 될 만큼 푸짐했어요',
    ],
  },
  {
    key: 'service',
    label: '서비스',
    hint: '응대는 친절하고 빨랐나요?',
    texts: [
      '불친절해서 기분이 상했어요',
      '응대가 무심하거나 오래 기다렸어요',
      '필요한 건 무난하게 챙겨 줬어요',
      '친절하고 빠르게 챙겨 줬어요',
      '말하기 전에 먼저 챙겨 줘서 감동했어요',
    ],
  },
  {
    key: 'price',
    label: '가격 만족도',
    hint: '낸 돈만큼 만족했나요?',
    texts: [
      '이 값이면 다시는 안 사 먹을 것 같아요',
      '값에 비해 조금 아쉬웠어요',
      '딱 낸 만큼이에요',
      '낸 돈보다 더 얻은 느낌이에요',
      '이 값에 이 정도면 남는 장사예요',
    ],
  },
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
