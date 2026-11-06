import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import styles from './AppHeader.module.css';

type Props = {
  title?: ReactNode;
  /** 뒤로 가기 대신 할 일. 없으면 이전 화면 (주소로 바로 들어왔으면 홈) */
  onBack?: () => void;
  /** 뒤로 가기 버튼을 숨긴다 (탭 첫 화면) */
  hideBack?: boolean;
  /** 오른쪽 끝 (저장 버튼, 단계 표시 등) */
  right?: ReactNode;
};

/** 화면 맨 위 "‹ 제목" 줄 */
export function AppHeader({ title, onBack, hideBack, right }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  // 링크로 바로 들어와 이전 화면이 없으면(key가 default) 앱 밖으로 나가지 않게 홈으로 보낸다.
  const back =
    onBack ??
    (() => (location.key === 'default' ? navigate('/', { replace: true }) : navigate(-1)));

  return (
    <header className={styles.header} data-back={!hideBack}>
      {!hideBack && (
        <button type="button" className={styles.back} onClick={back} aria-label="뒤로 가기">
          ‹
        </button>
      )}
      {title && <h1 className={styles.title}>{title}</h1>}
      {right && <div className={styles.right}>{right}</div>}
    </header>
  );
}
