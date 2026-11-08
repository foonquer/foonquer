import type { Stage } from '../api/mukkaebi';
import type { Wearing } from '../lib/wearing';
import { MukkaebiBody } from './MukkaebiFigure';
import styles from './MyLocationMarker.module.css';

/**
 * 지도 위 내 위치 = 꾸민 내 먹깨비 (피그마 홈 FINAL "현재 먹깨비" + 발밑 그림자 + "내 먹깨비" 이름표).
 * 감싼 요소에 data-walking="true"가 붙으면 몸을 좌우로 기울이며 걷는다 (피그마 먹깨비 이동 2-1~2-4)
 */
export function MyLocationMarker({ wearing, stage }: { wearing: Wearing; stage?: Stage }) {
  return (
    <span className={styles.marker} role="img" aria-label="내 위치 (내 먹깨비)">
      <span className={styles.figure}>
        <MukkaebiBody wearing={wearing} stage={stage} width={64} />
      </span>
      <span className={styles.shadow} />
      <span className={styles.label}>내 먹깨비</span>
    </span>
  );
}

/**
 * 좌표가 가리키는 곳 = 발밑 그림자 가운데. 몸 68.6px(64 × 150/140) + 그림자 12px(위로 10px 겹침)
 * + 이름표 22px 중 그림자 가운데(64.6px)의 비율
 */
export const MY_LOCATION_Y_ANCHOR = 0.7;
