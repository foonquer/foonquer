import type { Stage } from '../api/mukkaebi';
import mukkaebi from '../assets/illust/mukkaebi.svg';
import type { Wearing } from '../lib/wearing';
import { MukkaebiBody } from './MukkaebiFigure';
import styles from './Mukkaebi.module.css';

type Props = {
  /** 동그라미 지름 (Figma: 홈 54, 프로필 64, 프로필 수정 88) */
  size: number;
  /** 내 먹깨비 성장 단계 (알이면 알 그림). 모르면 기본 먹깨비 */
  stage?: Stage;
  /** 내 먹깨비가 입은 아이템 */
  wearing?: Wearing;
  className?: string;
};

/**
 * 크림색 동그라미 안의 기본 먹깨비 (프로필 사진 자리).
 * 꾸미기 아이템(모자 등)은 먹깨비 담당 화면에서 이 위에 겹친다.
 */
export function MukkaebiAvatar({ size, stage, wearing, className }: Props) {
  return (
    <span
      className={`${styles.avatar} ${className ?? ''}`}
      style={{ width: size, height: size }}
      data-figure={Boolean(stage || wearing)}
      aria-hidden="true"
    >
      {stage || wearing ? (
        <span className={styles.figure}>
          <MukkaebiBody wearing={wearing ?? {}} stage={stage} width={size * 0.953} />
        </span>
      ) : (
        <img src={mukkaebi} alt="" className={styles.image} />
      )}
    </span>
  );
}
