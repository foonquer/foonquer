import type { CSSProperties } from 'react';
import type { ItemCategory, Stage } from '../api/mukkaebi';
import egg from '../assets/illust/mukkaebi-egg.svg';
import nightsky from '../assets/illust/mukkaebi-nightsky.svg';
import mukkaebi from '../assets/illust/mukkaebi.svg';
import { backgroundArt } from '../lib/backgroundArt';
import { ITEM_SIZE, itemArt } from '../lib/itemArt';
import type { Wearing } from '../lib/wearing';
import { ItemIcon } from './ItemIcon';
import styles from './MukkaebiFigure.module.css';

type Props = {
  /** 착용(또는 입어보는) 아이템 — 그림이 있으면 먹깨비에 입히고, 없으면 칸 모양 아이콘을 둘레에 단다 */
  wearing: Wearing;
  /** 성장 단계 크기 (60·80·100%) */
  sizePercent?: number;
  /** 알이면 알 그림 */
  stage?: Stage;
  /** 고른 구 배경 (있으면 바탕을 그 구 그림으로 바꾼다) */
  background?: { sigunguName: string; bgKey: string | null } | null;
  /** 왼쪽 위 칩 (미리보기 · LV.7 아기 먹깨비) */
  badge?: string;
  height?: number;
};

// 몸 그림(140×150) 위 자리, 피그마 꾸미기 미리보기(318:5330·318:5540·318:5684, 탐방러 프로필 695:9450)에서 잰 값 (%)
const BODY_W = 140;
const BODY_H = 150;
/** 모자 아래 끝 (머리 위) */
const HAT_BOTTOM = 41;
/** 얼굴 아이템 가운데 높이 (눈) — 콧수염·스티커는 조금 아래 */
const FACE_CENTER: Record<string, number> = { FACE_MUSTACHE: 63, FACE_STAR_STICKER: 63 };
const FACE_CENTER_DEFAULT = 56.5;
/** 오른손에 드는 소품 (가운데 x, 아래 끝 y) */
const PROP_AT = { x: 82, bottom: 74 };
/** 왼손에 드는 방망이 (가운데 x, 아래 끝 y, 몸 높이에 대한 길이) */
const CLUB_AT = { x: 17, bottom: 80, height: 52 };

/** 아이템 그림을 몸 그림 위 어디에 얼마나 크게 둘지 */
function placeOf(category: ItemCategory, code: string): CSSProperties | null {
  const size = ITEM_SIZE[code];
  if (!size) return null;
  const [w, h] = size;
  const width = (w / BODY_W) * 100;
  const height = (h / BODY_H) * 100;
  switch (category) {
    case 'HAT':
      return { left: `${50 - width / 2}%`, top: `${HAT_BOTTOM - height}%`, width: `${width}%` };
    case 'FACE': {
      // 외알 안경은 오른눈에 렌즈(그림의 27,13)를 맞춘다
      if (code === 'FACE_MONOCLE') return { left: '39.8%', top: '47.3%', width: `${width}%` };
      const cy = FACE_CENTER[code] ?? FACE_CENTER_DEFAULT;
      return { left: `${50 - width / 2}%`, top: `${cy - height / 2}%`, width: `${width}%` };
    }
    case 'PROP':
      return {
        left: `${PROP_AT.x - width / 2}%`,
        top: `${PROP_AT.bottom - height}%`,
        width: `${width}%`,
      };
    case 'CLUB': {
      // 방망이 그림은 크게 그려져 있어 길이를 몸 높이에 맞춰 줄인다
      const clubWidth = ((CLUB_AT.height / 100) * BODY_H * (w / h) * 100) / BODY_W;
      return {
        left: `${CLUB_AT.x - clubWidth / 2}%`,
        top: `${CLUB_AT.bottom - CLUB_AT.height}%`,
        width: `${clubWidth}%`,
      };
    }
    default:
      return null;
  }
}

const LAYERS: ItemCategory[] = ['CLUB', 'PROP', 'FACE', 'HAT'];
const SPOTS: ItemCategory[] = ['HAT', 'FACE', 'PROP', 'CLUB'];

/** 꾸민 먹깨비 그림. 밤하늘(SKIN)이면 몸이 밤하늘 먹깨비, 모자·얼굴·소품·방망이는 몸 위에 입힌다 */
export function MukkaebiFigure({
  wearing,
  sizePercent = 100,
  stage,
  background,
  badge,
  height = 260,
}: Props) {
  const body = stage === 'EGG' ? egg : wearing.SKIN?.code === 'SKIN_NIGHTSKY' ? nightsky : mukkaebi;
  const placed = LAYERS.flatMap((c) => {
    const item = wearing[c];
    const art = itemArt(item?.code);
    const place = item?.code ? placeOf(c, item.code) : null;
    return item && art && place ? [{ c, art, place }] : [];
  });
  // 그림이 없는 아이템은 둘레에 칸 모양 아이콘과 이름
  const spots = SPOTS.filter((c) => wearing[c] && !placed.some((p) => p.c === c));
  const bgArt = backgroundArt(background?.bgKey);
  return (
    <div className={styles.stage} data-bg={Boolean(background)} style={{ height }}>
      {bgArt && <img src={bgArt} alt="" className={styles.bgArt} />}
      {/* 피그마 꾸미기 · 배경(318:5872): 왼쪽 위 칩에 미리보기와 배경 이름을 함께 */}
      {(badge || background) && (
        <span className={styles.label} data-bg={Boolean(background)}>
          {badge && <span className={styles.badge}>{badge}</span>}
          {background && <span className={styles.bgName}>{background.sigunguName} 배경</span>}
        </span>
      )}
      <span
        className={styles.body}
        style={{ width: `${Math.max(40, Math.min(100, sizePercent)) * 1.5}px` }}
      >
        <img src={body} alt="" className={styles.bodyImage} />
        {placed.map(({ c, art, place }) => (
          <img key={c} src={art} alt="" className={styles.item} data-layer={c} style={place} />
        ))}
      </span>
      {spots.map((c) => (
        <span key={c} className={styles.spot} data-spot={c}>
          <ItemIcon category={c} rarity={wearing[c]?.rarity ?? 'N'} size={34} />
          <span className={styles.spotName}>{wearing[c]?.name}</span>
        </span>
      ))}
    </div>
  );
}
