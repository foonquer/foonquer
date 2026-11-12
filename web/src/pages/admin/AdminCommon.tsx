import { EmptyState } from '../../components/StateViews';
import { ApiError, errorMessage } from '../../lib/api';
import styles from './Admin.module.css';

/** 목록이 남아 있는데 다시 불러오기·더 보기가 실패했을 때 (실패한 요청을 다시) */
export function moreError(error: unknown, retry: () => void) {
  return (
    <p className={styles.moreError} role="alert">
      {errorMessage(error)}
      <button type="button" onClick={retry}>
        다시 시도
      </button>
    </p>
  );
}

/** 운영자가 아니면 서버가 403을 준다 */
export function listError(error: unknown, reload: () => void) {
  return error instanceof ApiError && error.status === 403 ? (
    <EmptyState title="운영자만 볼 수 있어요" />
  ) : (
    <EmptyState title={errorMessage(error)} onRetry={reload} />
  );
}
