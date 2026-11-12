import { useState } from 'react';
import type { Conditions, FitReason, FitStatus } from '../../api/situation';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { formatScore } from '../../lib/format';
import {
  conditionCount,
  CRAVING_OPTIONS,
  EXCLUDE_OPTIONS,
  IMPORTANT_OPTIONS,
  MAX_CRAVING,
  MAX_IMPORTANT,
  sortConditions,
  WEATHER_OPTIONS,
  WHEN_OPTIONS,
  WHO_OPTIONS,
} from '../../lib/situation';
import styles from './Situation.module.css';

/** 상황 맞춤 결과에서 상세로 넘길 때 router state (⑦ 이유 카드) */
export type SituationContext = { title: string; fitScore: number; reasons: FitReason[] };

const MARK: Record<FitStatus, string> = { MATCH: '✓', PARTIAL: '△', NONE: '✕' };
const STATUS_NAME: Record<FitStatus, string> = { MATCH: '맞음', PARTIAL: '부분', NONE: '안 맞음' };

/** ✓ 맞음 / △ 부분 / ✕ 안 맞음 */
export function StatusMark({ status }: { status: FitStatus }) {
  return (
    <span className={styles.mark} data-status={status} role="img" aria-label={STATUS_NAME[status]}>
      {MARK[status]}
    </span>
  );
}

function Chip({
  on,
  tone = 'green',
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  tone?: 'green' | 'red';
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      className={styles.pick}
      data-on={on}
      data-tone={tone}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
    >
      {on && <span aria-hidden="true">✓ </span>}
      {children}
    </button>
  );
}

const toggle = <T,>(list: T[], value: T) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/** ③ 조건 추가 · 수정 시트. 처음 열 때 지금 조건, "초기화"는 AI가 이해한 조건으로 */
export function ConditionSheet({
  open,
  onClose,
  value,
  initial,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  value: Conditions;
  initial: Conditions;
  onApply: (next: Conditions) => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} label="조건 추가 · 수정">
      {/* 열 때마다 지금 조건으로 다시 시작한다 */}
      {open && <ConditionForm value={value} initial={initial} onApply={onApply} />}
    </BottomSheet>
  );
}

function ConditionForm({
  value,
  initial,
  onApply,
}: {
  value: Conditions;
  initial: Conditions;
  onApply: (next: Conditions) => void;
}) {
  const [draft, setDraft] = useState(value);
  const count = conditionCount(draft);
  const full = draft.important.length >= MAX_IMPORTANT;

  return (
    <div className={styles.sheet}>
      <div className={styles.sheetHead}>
        <h2>조건 추가 · 수정</h2>
        <button type="button" className={styles.textButton} onClick={() => setDraft(initial)}>
          초기화
        </button>
      </div>
      <p className={styles.sheetLead}>
        AI가 이해한 조건은 미리 선택해 뒀어요. 누르면 켜고 끌 수 있어요.
      </p>

      <fieldset className={styles.group}>
        <legend>
          누구랑<small>하나만</small>
        </legend>
        {WHO_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            on={draft.who === o.value}
            onClick={() => setDraft({ ...draft, who: draft.who === o.value ? null : o.value })}
          >
            {o.label}
          </Chip>
        ))}
      </fieldset>
      <fieldset className={styles.group}>
        <legend>
          언제<small>하나만</small>
        </legend>
        {WHEN_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            on={draft.when === o.value}
            onClick={() => setDraft({ ...draft, when: draft.when === o.value ? null : o.value })}
          >
            {o.label}
          </Chip>
        ))}
      </fieldset>
      <fieldset className={styles.group}>
        <legend>
          날씨<small>하나만</small>
        </legend>
        {WEATHER_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            on={draft.weather === o.value}
            onClick={() =>
              setDraft({ ...draft, weather: draft.weather === o.value ? null : o.value })
            }
          >
            {o.label}
          </Chip>
        ))}
      </fieldset>
      <fieldset className={styles.group}>
        <legend>
          먹고 싶어요<small>최대 {MAX_CRAVING}개</small>
        </legend>
        {CRAVING_OPTIONS.map((o) => {
          const on = draft.craving.includes(o.value);
          return (
            <Chip
              key={o.value}
              on={on}
              disabled={!on && draft.craving.length >= MAX_CRAVING}
              onClick={() => setDraft({ ...draft, craving: toggle(draft.craving, o.value) })}
            >
              {o.label}
            </Chip>
          );
        })}
      </fieldset>
      <fieldset className={styles.group}>
        <legend>
          빼기<small>여러 개</small>
        </legend>
        {EXCLUDE_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            tone="red"
            on={draft.exclude.includes(o.value)}
            onClick={() => setDraft({ ...draft, exclude: toggle(draft.exclude, o.value) })}
          >
            {o.label}
          </Chip>
        ))}
      </fieldset>
      <fieldset className={styles.group}>
        <legend>
          중요해요<small>최대 {MAX_IMPORTANT}개</small>
        </legend>
        {IMPORTANT_OPTIONS.map((o) => {
          const on = draft.important.includes(o.value);
          return (
            <Chip
              key={o.value}
              on={on}
              disabled={!on && full}
              onClick={() => setDraft({ ...draft, important: toggle(draft.important, o.value) })}
            >
              {o.label}
            </Chip>
          );
        })}
      </fieldset>

      <Button disabled={count === 0} onClick={() => onApply(sortConditions(draft))}>
        {count === 0 ? '조건을 하나 이상 골라 주세요' : `적용하기 (조건 ${count}개)`}
      </Button>
    </div>
  );
}

/** ④ 상황 적합 설명 시트: 조건 전체와 근거 */
export function FitSheet({
  open,
  onClose,
  name,
  ratingScore,
  fitScore,
  reasons,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  ratingScore: number | null;
  fitScore: number;
  reasons: FitReason[];
}) {
  const score = formatScore(ratingScore);
  return (
    <BottomSheet open={open} onClose={onClose} label="상황 적합도 설명">
      <div className={styles.sheet}>
        <h2 className={styles.fitTitle}>
          {name} · 상황 적합 {fitScore}%
        </h2>
        <p className={styles.sheetLead}>
          적은 조건 {reasons.length}개를 인증 리뷰 · 세부 별점 · 가게 정보에서 하나씩 확인했어요.
        </p>
        <ul className={styles.fitList}>
          {reasons.map((r) => (
            <li key={`${r.kind}-${r.condition}`} data-status={r.status}>
              <StatusMark status={r.status} />
              <strong>{r.label}</strong>
              <span>{r.evidence}</span>
            </li>
          ))}
        </ul>
        <div className={styles.fitNote}>
          <strong>
            {score ? `신뢰 별점(★ ${score} 맛)은 바뀌지 않아요.` : '신뢰 별점은 바뀌지 않아요.'}
          </strong>
          <p>
            같은 별점대 안에서 지금 상황에 잘 맞는 순서로 보여 드려요. 조건마다 맞음 · 부분 · 안
            맞음으로 보고, 중요해요 조건에 조금 더 무게를 둬서 계산했어요.
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}

/** ⑦ 상세(상황 맞춤에서 열었을 때) "…에 맞는 이유" — 맞음 2줄(중요해요 먼저) + 부분 1줄 */
export function SituationReasonCard({
  context,
  onOpenFit,
}: {
  context: SituationContext;
  onOpenFit: () => void;
}) {
  const first = (status: FitStatus) => [
    ...context.reasons.filter((r) => r.status === status && r.kind === 'IMPORTANT'),
    ...context.reasons.filter((r) => r.status === status && r.kind !== 'IMPORTANT'),
  ];
  const lines = [...first('MATCH').slice(0, 2), ...first('PARTIAL').slice(0, 1)];
  return (
    <section className={styles.reasonCard} aria-label="상황에 맞는 이유">
      <div className={styles.reasonHead}>
        <p>{context.title}에 맞는 이유</p>
        <button type="button" className={styles.fitPill} onClick={onOpenFit}>
          상황 적합 {context.fitScore}% ›
        </button>
      </div>
      <ul className={styles.reasonLines}>
        {lines.map((r) => (
          <li key={`${r.kind}-${r.condition}`}>
            <StatusMark status={r.status} />
            {r.evidence}
          </li>
        ))}
      </ul>
    </section>
  );
}
