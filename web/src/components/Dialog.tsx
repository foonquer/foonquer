import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import styles from './Dialog.module.css';

type Props = {
  open: boolean;
  title: ReactNode;
  /** 설명 문단들 (Figma: 회색 14px, 문단 사이 8px) */
  description?: ReactNode[];
  cancelLabel?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  /** 확인을 누른 뒤 처리 중 */
  busy?: boolean;
};

/** 가운데 확인창 (내 동네 빼기·추가, 로그아웃) */
export function Dialog({
  open,
  title,
  description = [],
  cancelLabel = '취소',
  confirmLabel,
  onCancel,
  onConfirm,
  busy,
}: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return createPortal(
    <div className={styles.layer}>
      <div className={styles.dim} onClick={onCancel} aria-hidden="true" />
      <section
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {description.map((text, i) => (
          <p key={i} className={styles.description}>
            {text}
          </p>
        ))}
        <div className={styles.buttons}>
          <Button variant="gray" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
