import { useState } from 'react';
import { foodArtOf } from '../lib/foodArt';
import styles from './FoodImage.module.css';

type Props = {
  /** 가게 대표 사진 (인증 리뷰 사진). 없거나 못 불러오면 음식 종류 그림 */
  imageUrl?: string | null;
  categoryName?: string | null;
  /** 크기·둥글기 (없으면 부모를 꽉 채우고 부모 둥글기를 따른다) */
  className?: string;
};

/** 가게 사진 자리: 리뷰 사진이 있으면 사진, 없으면 음식 종류 그림 (카드·상세·미리보기·추천·퀘스트) */
export function FoodImage({ imageUrl, categoryName, className }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  const photo = imageUrl && failed !== imageUrl ? imageUrl : null;
  const art = foodArtOf(categoryName);
  return (
    <span
      className={`${styles.box} ${className ?? ''}`}
      style={photo ? undefined : { background: art.bg }}
      aria-hidden="true"
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          className={styles.photo}
          loading="lazy"
          draggable={false}
          onError={() => setFailed(photo)}
        />
      ) : (
        <img src={art.src} alt="" className={styles.art} draggable={false} />
      )}
    </span>
  );
}
