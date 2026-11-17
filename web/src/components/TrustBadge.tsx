import { TRUST_LEVEL_NAME, type TrustLevel } from '../lib/trustLevel';
import styles from './TrustBadge.module.css';

/**
 * 리뷰어 단계 배지. 내 것이면 신뢰 온도 숫자도 같이 (temp는 본인에게만 온다).
 * 단계가 없으면(다른 사람이 잎새 미만) 아무것도 그리지 않는다
 */
export function TrustBadge({ level, temp }: { level: TrustLevel | null; temp: number | null }) {
  if (!level) return null;
  const name = TRUST_LEVEL_NAME[level];
  const label =
    temp === null ? `리뷰어 단계 ${name}` : `리뷰어 단계 ${name}, 신뢰 온도 ${temp.toFixed(1)}도`;
  return (
    <span className={styles.badge} data-level={level} role="img" aria-label={label}>
      {name}
      {temp !== null && <span className={styles.temp}>{temp.toFixed(1)}°</span>}
    </span>
  );
}
