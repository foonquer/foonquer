import mukkaebi from '../assets/illust/mukkaebi.svg';
import styles from './Mukkaebi.module.css';

type Props = {
  /** 동그라미 지름 (Figma: 홈 54, 프로필 64, 프로필 수정 88) */
  size: number;
  className?: string;
};

/**
 * 크림색 동그라미 안의 기본 먹깨비 (프로필 사진 자리).
 * 꾸미기 아이템(모자 등)은 먹깨비 담당 화면에서 이 위에 겹친다.
 */
export function MukkaebiAvatar({ size, className }: Props) {
  return (
    <span
      className={`${styles.avatar} ${className ?? ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img src={mukkaebi} alt="" className={styles.image} />
    </span>
  );
}
