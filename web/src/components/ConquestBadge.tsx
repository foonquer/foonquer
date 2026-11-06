import type { ConquestState } from '../api/restaurants';
import styles from './ConquestBadge.module.css';

const LABEL: Record<ConquestState, string> = {
  CONQUERED: '정복 완료',
  MOVING: '이동 중',
  NOT_CONQUERED: '미정복',
};

type Props = {
  state: ConquestState;
  /** sm: 목록 카드 / md: 미리보기 시트·상세 */
  size?: 'sm' | 'md';
};

/** 내 정복 상태 칩 (정복 완료 초록 / 이동 중 크림 / 미정복 산호) */
export function ConquestBadge({ state, size = 'sm' }: Props) {
  return (
    <span className={styles.badge} data-state={state} data-size={size}>
      {LABEL[state]}
    </span>
  );
}
