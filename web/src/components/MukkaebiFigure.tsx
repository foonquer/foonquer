import type { ItemCategory } from '../api/mukkaebi';
import mukkaebi from '../assets/illust/mukkaebi.svg';
import type { Wearing } from '../lib/wearing';
import { ItemIcon } from './ItemIcon';
import styles from './MukkaebiFigure.module.css';

type Props = {
  /** 착용(또는 입어보는) 아이템 — 칸마다 먹깨비 둘레에 붙여 보여 준다 */
  wearing: Wearing;
  /** 성장 단계 크기 (60·80·100%) */
  sizePercent?: number;
  /** 구 배경 이름 (있으면 바탕을 바꾼다) */
  background?: string | null;
  /** 왼쪽 위 칩 (미리보기 · LV.7 아기 먹깨비) */
  badge?: string;
  height?: number;
};

const SPOTS: ItemCategory[] = ['HAT', 'FACE', 'PROP', 'CLUB', 'SKIN'];

/** 꾸민 먹깨비 그림. 아이템 그림 대신 칸 모양 아이콘과 이름을 둘레에 단다 */
export function MukkaebiFigure({
  wearing,
  sizePercent = 100,
  background,
  badge,
  height = 260,
}: Props) {
  const worn = SPOTS.filter((c) => wearing[c]);
  return (
    <div className={styles.stage} data-bg={Boolean(background)} style={{ height }}>
      {badge && <span className={styles.badge}>{badge}</span>}
      {background && <span className={styles.bgName}>{background} 배경</span>}
      <img
        src={mukkaebi}
        alt=""
        className={styles.body}
        style={{ width: `${Math.max(40, Math.min(100, sizePercent)) * 1.5}px` }}
      />
      {worn.map((c) => (
        <span key={c} className={styles.spot} data-spot={c}>
          <ItemIcon category={c} rarity={wearing[c]?.rarity ?? 'N'} size={34} />
          <span className={styles.spotName}>{wearing[c]?.name}</span>
        </span>
      ))}
    </div>
  );
}
