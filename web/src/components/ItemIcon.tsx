import type { ItemCategory, Rarity } from '../api/mukkaebi';
import { itemArt } from '../lib/itemArt';
import styles from './ItemIcon.module.css';

/** 칸마다 단순한 모양 (그림이 없는 아이템이 종류를 알아볼 수 있게) */
const SHAPES: Record<ItemCategory, string> = {
  // 모자
  HAT: 'M5 17h14v2H5zM7 16c0-5 2-9 5-9s5 4 5 9z',
  // 안경
  FACE: 'M3 10h18v2h-1a4 4 0 0 1-8 0 4 4 0 0 1-8 0H3zm3 2a2 2 0 0 0 4 0zm8 0a2 2 0 0 0 4 0z',
  // 풍선
  PROP: 'M12 3a5 5 0 0 1 5 5c0 3.5-3 6-5 7-2-1-5-3.5-5-7a5 5 0 0 1 5-5zm-.6 12.5h1.2l.4 1.5h-2zM12 17v4',
  // 먹깨비 (별)
  SKIN: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',
  // 방망이
  CLUB: 'M15 3c2.5 0 4 1.6 4 3.5 0 1.5-1 2.6-2.4 3.4L9 18l-3 3-2-2 3-3 7.9-7.9C15.4 7 15 6 15 5c0-1.1-.9-2-2-2z',
};

type Props = {
  category: ItemCategory;
  rarity: Rarity;
  /** 아이템 코드 — 그림이 있으면 그림, 없으면 종류 모양 */
  code?: string | null;
  size?: number;
  owned?: boolean;
};

/** 아이템 칸 그림 (아이템 그림 또는 종류 모양 + 등급 색). 갖지 않은 도감 칸은 실루엣 */
export function ItemIcon({ category, rarity, code, size = 44, owned = true }: Props) {
  const art = itemArt(code);
  return (
    <span
      className={styles.icon}
      data-rarity={rarity}
      data-owned={owned}
      data-art={Boolean(art)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {art ? (
        <img src={art} alt="" className={styles.art} />
      ) : (
        <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6}>
          <path d={SHAPES[category]} fillRule="evenodd" />
        </svg>
      )}
    </span>
  );
}
