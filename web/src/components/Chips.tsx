import { radioGroupKeyDown, radioTabIndex } from '../lib/a11y';
import styles from './Chips.module.css';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
};

/** 정렬·추천 기준 칩 (현지인 인기 / 재방문 많음 / …). 고른 칩은 진초록 */
export function FilterChips<T extends string>({ options, value, onChange, label }: Props<T>) {
  return (
    <div
      className={styles.row}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) =>
        radioGroupKeyDown(
          e,
          options.map((o) => o.value),
          value,
          onChange,
        )
      }
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={radioTabIndex(option.value, value, options[0].value)}
          className={styles.chip}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
