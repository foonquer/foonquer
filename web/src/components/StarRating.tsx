import { useId, useState, type CSSProperties } from 'react';
import styles from './StarRating.module.css';

/** 꼭짓점이 둥글고 통통한 별 (24×24) */
export const STAR_PATH =
  'M11.09 3.49Q12.00 1.60 12.91 3.49L14.61 7.06Q15.17 8.23 16.46 8.40L20.38 8.92Q22.46 9.20 20.94 10.65L18.08 13.37Q17.14 14.27 17.37 15.55L18.09 19.43Q18.47 21.50 16.62 20.50L13.14 18.62Q12.00 18.00 10.86 18.62L7.38 20.50Q5.53 21.50 5.91 19.43L6.63 15.55Q6.86 14.27 5.92 13.37L3.06 10.65Q1.54 9.20 3.62 8.92L7.54 8.40Q8.83 8.23 9.39 7.06Z';

/** 채운 별의 금빛 (위가 밝다) */
function GoldGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#ffd96e" />
      <stop offset="1" stopColor="#f2a234" />
    </linearGradient>
  );
}

/** 글자 사이에 넣는 작은 별 하나 (맛 ★ 4.5 자리). 글자 크기를 따라간다 */
export function StarIcon() {
  const id = useId();
  return (
    <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden="true">
      <defs>
        <GoldGradient id={`${id}-g`} />
      </defs>
      <path d={STAR_PATH} fill={`url(#${id}-g)`} className={styles.full} />
    </svg>
  );
}

/**
 * 별 하나 (fill: 0 ~ 1). 채운 부분은 위가 밝은 금빛, 왼쪽 위에 작은 반짝임.
 * pop이면 채워질 때 한 번 통통 튄다 (delay: 앞 별부터 차례로)
 */
function Star({
  fill,
  size,
  pop,
  delay = 0,
}: {
  fill: number;
  size: number;
  pop?: boolean;
  delay?: number;
}) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={styles.star}
      data-pop={pop}
      style={{ '--delay': `${delay}ms` } as CSSProperties}
    >
      <path d={STAR_PATH} className={styles.empty} />
      {fill > 0 && (
        <>
          <defs>
            <GoldGradient id={`${id}-g`} />
            <clipPath id={`${id}-c`}>
              <rect x="0" y="0" width={24 * fill} height="24" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${id}-c)`}>
            <path d={STAR_PATH} fill={`url(#${id}-g)`} className={styles.full} />
            <ellipse
              cx="8.4"
              cy="9.9"
              rx="1.7"
              ry="0.95"
              fill="#ffffff"
              opacity="0.55"
              transform="rotate(-38 8.4 9.9)"
            />
          </g>
        </>
      )}
    </svg>
  );
}

/** 보기만 하는 별 5개 (가게 리뷰 목록·세부 별점 기준 등) */
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
  /** 고를 때마다 올려서, 채워진 별을 다시 그려 통통 튀게 한다 (처음 그릴 때는 가만히) */
  const [picks, setPicks] = useState(0);
  const pick = (v: number) => {
    setPicks((n) => n + 1);
    onChange(v);
  };
  const move = (delta: number) =>
    pick(Math.min(5, Math.max(step, Math.round((current + delta) / step) * step)));

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
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, current - (n - 1)));
        return (
          <span key={n} className={styles.cell} style={{ width: size, height: size }}>
            <Star
              key={fill > 0 ? `on${picks}` : 'off'}
              size={size}
              fill={fill}
              pop={picks > 0 && fill > 0}
              delay={(n - 1) * 40}
            />
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
                  onClick={() => pick(v)}
                />
              );
            })}
          </span>
        );
      })}
    </div>
  );
}
