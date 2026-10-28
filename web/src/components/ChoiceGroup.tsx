import check from '../assets/icons/check.svg';
import styles from './ChoiceGroup.module.css';

type Option<T> = { value: T; label: string };

type Props<T extends string | number> = {
  label: string;
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** 한 줄에 몇 개 (나머지는 다음 줄) */
  columns: number;
  /** 고른 칸 앞에 ✓ 아이콘 (가입 S-05). 프로필 수정은 글자만 굵게 */
  withCheck?: boolean;
  /** 칸 크기: lg = 높이 56·52 둥글기 16 (가입), sm = 높이 46·44 둥글기 14 (프로필 수정) */
  size?: 'lg' | 'sm';
  /** 칸 높이 (px) */
  height: number;
};

/** 하나만 고르는 칸 버튼 묶음 (성별, 나이대) */
export function ChoiceGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  columns,
  withCheck,
  size = 'lg',
  height,
}: Props<T>) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{label}</legend>
      <div
        className={styles.grid}
        role="radiogroup"
        aria-label={label}
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={styles.option}
              data-size={size}
              style={{ height }}
              onClick={() => onChange(option.value)}
            >
              {selected && withCheck && <img src={check} alt="" width={18} height={18} />}
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
