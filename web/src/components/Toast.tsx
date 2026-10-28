import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import styles from './Toast.module.css';

type ToastInput = {
  message: string;
  /** 앞에 ✓ 아이콘 */
  check?: boolean;
  /** 오른쪽 링크 (예: "리스트 보기 ›") */
  action?: { label: string; to: string };
};

type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<(toast: ToastInput | string) => void>(() => {});

const SHOW_MS = 2500;

/** 화면 아래에 잠깐 떴다 사라지는 안내. 한 번에 하나만 보여 준다 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nextId = useRef(0);

  const show = useCallback((input: ToastInput | string) => {
    const item = typeof input === 'string' ? { message: input } : input;
    nextId.current += 1;
    setToast({ ...item, id: nextId.current });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), SHOW_MS);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.area} role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={styles.toast}>
            {toast.check && (
              <span className={styles.check} aria-hidden="true">
                ✓
              </span>
            )}
            <span>{toast.message}</span>
            {toast.action && (
              <>
                <span className={styles.dot} aria-hidden="true">
                  ·
                </span>
                <Link to={toast.action.to} className={styles.action}>
                  {toast.action.label} ›
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  return useContext(ToastContext);
}
