import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import styles from './TextField.module.css';

export type FieldStatus = 'default' | 'ok' | 'error' | 'alert';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  label?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  /** ok: 초록 테두리 / error: 빨간 바탕(회원가입) / alert: 산호색 테두리(로그인) */
  status?: FieldStatus;
  /** 입력창 아래 문구. ok면 앞에 ✓가 붙는다 */
  message?: ReactNode;
  /** 문구 색을 입력창 상태와 다르게 (예: 테두리는 기본, 문구는 초록 ✓) */
  messageStatus?: FieldStatus;
  /** message 아래 작은 회색 안내 */
  hint?: ReactNode;
  /** 입력창 오른쪽 끝 (글자 수, 남은 시간, 버튼) */
  right?: ReactNode;
  /** 비밀번호 입력창: 오른쪽에 보기/숨기기 */
  password?: boolean;
};

export function TextField({
  label,
  value,
  onChange,
  status = 'default',
  message,
  messageStatus,
  hint,
  right,
  password,
  id,
  type = 'text',
  className,
  ...inputProps
}: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  const [visible, setVisible] = useState(false);
  const tone = messageStatus ?? status;

  return (
    <div className={`${styles.field} ${className ?? ''}`}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      <div className={styles.box} data-status={status}>
        <input
          {...inputProps}
          id={inputId}
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={password ? (visible ? 'text' : 'password') : type}
          aria-invalid={status === 'error' || status === 'alert' ? true : undefined}
          aria-describedby={message ? messageId : undefined}
        />
        {right}
        {password && (
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
          >
            {visible ? '숨기기' : '보기'}
          </button>
        )}
      </div>
      {message && (
        <p id={messageId} className={styles.message} data-status={tone}>
          {tone === 'ok' && '✓ '}
          {message}
        </p>
      )}
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
