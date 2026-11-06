import { useId } from 'react';
import styles from './StarRating.module.css';

const STAR =
  'M12 2.5l2.9 6.06 6.6.82-4.87 4.56 1.25 6.56L12 17.3l-5.88 3.2 1.25-6.56L2.5 9.38l6.6-.82z';

/** 별 하나 (fill: 0 ~ 1) */
function Star({ fill, size }: { fill: number; size: number }) {
  const clip = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={styles.star}>
      <path d={STAR} className={styles.empty} />
      {fill > 0 && (
        <>
          <clipPath id={clip}>
            <rect x="0" y="0" width={24 * fill} height="24" />
          </clipPath>
          <path d={STAR} className={styles.full} clipPath={`url(#${clip})`} />
        </>
      )}
    </svg>
  );
}

/** 보기만 하는 별 5개 (맛 ★ 4.5 등) */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className={styles.row} role="img" aria-label={`5점 만점에 ${value}점`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} fill={Math.max(0, Math.min(1, value - (n - 1)))} />
      ))}
    </span>
  );
}

type Props = {
  value: number | null;
  onChange: (value: number) => void;
  /** 0.5: 맛 별점 (반 개 단위) / 1: 세부 별점 */
  step?: 0.5 | 1;
  /** 별 하나 크기 (px) */
  size?: number;
  label: string;
};

/**
 * 눌러서 고르는 별 5개. 반 개 단위면 별의 왼쪽 반을 누르면 .5점.
 * 키보드는 ← → 로 한 단계씩 바꾼다.
 */
export function StarInput({ value, onChange, step = 1, size = 28, label }: Props) {
  const steps = step === 0.5 ? [0.5, 1] : [1];
  const current = value ?? 0;
  const move = (delta: number) =>
    onChange(Math.min(5, Math.max(step, Math.round((current + delta) / step) * step)));

  return (
    <div
      className={styles.input}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={step}
      aria-valuemax={5}
      aria-valuenow={value ?? undefined}
      aria-valuetext={value === null ? '고르지 않음' : `${value}점`}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          move(step);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          move(-step);
        }
      }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={styles.cell} style={{ width: size, height: size }}>
          <Star size={size} fill={Math.max(0, Math.min(1, current - (n - 1)))} />
          {steps.map((part) => {
            const v = n - 1 + part;
            return (
              <button
                key={part}
                type="button"
                tabIndex={-1}
                className={styles.hit}
                data-part={steps.length === 1 ? 'whole' : part === 0.5 ? 'left' : 'right'}
                aria-label={`${v}점`}
                onClick={() => onChange(v)}
              />
            );
          })}
        </span>
      ))}
    </div>
  );
}
