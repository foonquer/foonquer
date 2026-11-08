import mukkaebi from '../assets/illust/mukkaebi.svg';
import { Button, ButtonLink } from './Button';
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
  /** 빈 화면에서 할 다음 행동 (예: 맛집 찾으러 가기) */
  action?: { label: string; to: string };
};

/** 먹깨비 그림과 안내 (빈 목록·준비 중·불러오기 실패) */
export function EmptyState({ title, description, onRetry, action }: EmptyProps) {
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
      {action && (
        <ButtonLink to={action.to} block={false} size="sm">
          {action.label}
        </ButtonLink>
      )}
    </div>
  );
}
