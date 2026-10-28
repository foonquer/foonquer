import type { ReactNode } from 'react';
import styles from './PageTitle.module.css';

type Props = {
  /** 큰 제목 (Bold 24). 줄바꿈은 \n */
  title: ReactNode;
  description?: ReactNode;
  /** 설명을 작게 (Medium 13, 비밀번호 화면) */
  compact?: boolean;
  className?: string;
};

/** 화면 위쪽 큰 제목과 설명 (Figma: 제목 Bold 24 / 행간 1.35, 설명 14 회색) */
export function PageTitle({ title, description, compact, className }: Props) {
  return (
    <div className={`${styles.wrap} ${className ?? ''}`}>
      <h2 className={styles.title}>{title}</h2>
      {description && (
        <p className={styles.description} data-compact={compact}>
          {description}
        </p>
      )}
    </div>
  );
}
