import mukkaebi from '../assets/illust/mukkaebi.svg';
import { Button } from './Button';
import styles from './StateViews.module.css';

/** 불러오는 중 (가운데 작은 원) */
export function Loading({ label = '불러오는 중' }: { label?: string }) {
  return (
    <div className={styles.center} role="status" aria-label={label}>
      <span className={styles.spinner} />
    </div>
  );
}

type EmptyProps = {
  title: string;
  description?: string;
  /** 다시 시도 버튼 */
  onRetry?: () => void;
};

/** 먹깨비 그림과 안내 (빈 목록·준비 중·불러오기 실패) */
export function EmptyState({ title, description, onRetry }: EmptyProps) {
  return (
    <div className={styles.center}>
      <div className={styles.circle}>
        <img src={mukkaebi} alt="" className={styles.mukkaebi} />
      </div>
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {onRetry && (
        <Button variant="white" block={false} size="sm" onClick={onRetry}>
          다시 시도
        </Button>
      )}
    </div>
  );
}
