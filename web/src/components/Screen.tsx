import type { ReactNode } from 'react';
import styles from './Screen.module.css';

type Props = {
  children: ReactNode;
  /** 화면 아래에 붙는 버튼 영역 (Figma: 아래에서 44px 위) */
  footer?: ReactNode;
  /** 바탕색 (기본: 연한 초록 회색) */
  tone?: 'default' | 'forest' | 'white';
  /** 하단 탭 안의 화면 (탭 틀이 이미 화면 높이를 채운다) */
  inTab?: boolean;
  className?: string;
};

/** 한 화면의 틀. 내용이 짧아도 footer는 화면 아래에 붙는다 */
export function Screen({ children, footer, tone = 'default', inTab, className }: Props) {
  return (
    <div className={`${styles.screen} ${className ?? ''}`} data-tone={tone} data-in-tab={inTab}>
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}
