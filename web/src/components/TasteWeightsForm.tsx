import type { TasteWeights } from '../api/users';
import { radioGroupKeyDown, radioTabIndex } from '../lib/a11y';
import { formatScore } from '../lib/format';
import {
  sampleMyOverall,
  TASTE_ITEMS,
  WEIGHT_LEVELS,
  weightPercents,
  weightSummary,
} from '../lib/taste';
import styles from './TasteWeightsForm.module.css';

type Props = { value: TasteWeights; onChange: (value: TasteWeights) => void };

const BAR_COLORS: Record<string, string> = {
  taste: '#de9839',
  cleanliness: '#eab36a',
  portion: '#a7cfa6',
  service: '#c4dcc0',
  price: '#59a864',
};

/** 맛·청결·양·서비스·가격마다 보통/중요/아주 중요 + "이렇게 반영돼요" (가입 S-05-2, 설정 → 내 취향 설정) */
export function TasteWeightsForm({ value, onChange }: Props) {
  const percents = weightPercents(value);
  const sample = sampleMyOverall(value);
  const levels = WEIGHT_LEVELS.map((l) => l.value);

  return (
    <>
      <div className={styles.card}>
        {TASTE_ITEMS.map((item) => (
          <div key={item.key} className={styles.row}>
            <div className={styles.label}>
              <p className={styles.name}>{item.label}</p>
              <p className={styles.hint}>{item.hint}</p>
            </div>
            <div
              className={styles.options}
              role="radiogroup"
              aria-label={`${item.label} 중요도`}
              onKeyDown={(e) =>
                radioGroupKeyDown(e, levels, value[item.key], (level) =>
                  onChange({ ...value, [item.key]: level }),
                )
              }
            >
              {WEIGHT_LEVELS.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  role="radio"
                  aria-checked={value[item.key] === level.value}
                  tabIndex={radioTabIndex(level.value, value[item.key], levels[0])}
                  className={styles.option}
                  onClick={() => onChange({ ...value, [item.key]: level.value })}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <section className={styles.reflect} aria-label="이렇게 반영돼요">
        <h2 className={styles.reflectTitle}>이렇게 반영돼요</h2>
        <div className={styles.bar} aria-hidden="true">
          {TASTE_ITEMS.map((item) => (
            <span
              key={item.key}
              style={{ width: `${percents[item.key]}%`, background: BAR_COLORS[item.key] }}
            />
          ))}
        </div>
        <p className={styles.summary}>{weightSummary(value)}</p>
        <p className={styles.example}>
          예) 새맛집 — 맛 별점 ★ {formatScore(sample.taste)} → 내 종합 ★{' '}
          {formatScore(sample.myOverall)}
        </p>
      </section>
    </>
  );
}
