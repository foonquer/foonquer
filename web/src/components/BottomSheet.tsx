import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from '../lib/a11y';
import styles from './BottomSheet.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 화면 읽기 프로그램에 알려 줄 시트 이름 */
  label: string;
  /** 시트 높이 (예: '668px', '80dvh'). 없으면 내용만큼 */
  height?: string;
  /** 덮개 진하기: strong(위치 권한 시트) / light(지역 선택 시트) */
  dim?: 'strong' | 'light';
};

/** 아래에서 올라오는 시트. 바깥(덮개)을 누르거나 Esc를 누르면 닫힌다 */
export function BottomSheet({ open, onClose, children, label, height, dim = 'strong' }: Props) {
  const sheet = useRef<HTMLElement>(null);
  useModalFocus(open, sheet);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className={styles.layer}>
      {/* 덮개는 마우스·터치로만 닫는다 (키보드는 Esc). Tab 정지점이 되지 않게 한다 */}
      <div className={styles.dim} data-dim={dim} onClick={onClose} aria-hidden="true" />
      <section
        ref={sheet}
        tabIndex={-1}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={height ? { height } : undefined}
      >
        <div className={styles.handle} aria-hidden="true" />
        {children}
      </section>
    </div>,
    document.body,
  );
}
