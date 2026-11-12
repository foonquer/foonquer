import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  type Conditions,
  getSituationRecommendations,
  parseSituation,
  type SituationItem,
  type SituationParse,
  type SituationResult,
  type SituationSuggestion,
} from '../../api/situation';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { RegionChip } from '../../components/RegionChip';
import { RegionSelectSheet } from '../../components/RegionSelectSheet';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatDistance, formatScore } from '../../lib/format';
import { useViewRegion } from '../../lib/region';
import {
  conditionCount,
  CRAVING_OPTIONS,
  EMPTY_CONDITIONS,
  EXCLUDE_OPTIONS,
  IMPORTANT_OPTIONS,
  labelOf,
  MAX_SITUATION_TEXT,
  normalizeConditions,
  RETRY_EXAMPLES,
  SITUATION_EXAMPLES,
  WEATHER_OPTIONS,
  WHEN_OPTIONS,
  WHO_OPTIONS,
} from '../../lib/situation';
import { useAsync } from '../../lib/useAsync';
import { useMyCoords } from '../../lib/useMyCoords';
import { ConditionSheet, FitSheet, type SituationContext } from './SituationParts';
import styles from './Situation.module.css';

type Step = 'input' | 'reading' | 'conditions' | 'notFound' | 'result';

/** 조건 읽기가 이보다 오래 걸리면 "조금 더 걸리고 있어요" + 취소 (개발 메모 7번) */
const SLOW_MS = 5_000;

/** 내 상황으로 추천 /recommendations/situation (피그마 3 상황 입력 → 이해한 조건 → 상황 맞춤 결과, 3-4 ①~⑥) */
export function SituationPage() {
  const toast = useToast();
  const { region, error: regionError, retry } = useViewRegion();
  const { coords, ready } = useMyCoords();
  const [regionOpen, setRegionOpen] = useState(false);
  const [text, setText] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [slow, setSlow] = useState(false);
  const [parsed, setParsed] = useState<SituationParse | null>(null);
  const [conditions, setConditions] = useState<Conditions>(EMPTY_CONDITIONS);
  const [sheetOpen, setSheetOpen] = useState(false);
  // ⑥ "동네 넓히기": 지금 동네에서 넓힌 구 (동네를 바꾸면 풀린다)
  const [widen, setWiden] = useState<{ from: number; to: number } | null>(null);
  const reading = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => reading.current?.abort(), []);

  const regionId =
    region && widen?.from === region.regionId ? widen.to : (region?.regionId ?? null);
  const result = useAsync(
    () =>
      step === 'result' && regionId !== null && ready
        ? getSituationRecommendations({
            regionId,
            conditions,
            lat: coords?.lat,
            lng: coords?.lng,
          })
        : new Promise<never>(() => {}),
    [step, regionId, conditions, ready, coords?.lat, coords?.lng],
  );

  const read = async (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 2) return;
    reading.current?.abort();
    const controller = new AbortController();
    reading.current = controller;
    setStep('reading');
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), SLOW_MS);
    try {
      const res = await parseSituation(trimmed, controller.signal);
      if (controller.signal.aborted) return;
      const parsedConditions = normalizeConditions(res.conditions);
      setParsed({ ...res, conditions: parsedConditions });
      setConditions(parsedConditions);
      setStep(res.found ? 'conditions' : 'notFound');
    } catch (err) {
      if (controller.signal.aborted) return;
      toast(errorMessage(err));
      setStep('input');
    } finally {
      window.clearTimeout(timer);
    }
  };

  const cancelReading = () => {
    reading.current?.abort();
    setStep('input');
  };

  const startOver = () => {
    reading.current?.abort();
    setText('');
    setStep('input');
    input.current?.focus();
  };

  // ③ 적용: 이해한 조건 화면에서는 조건만 바꾸고, 결과 화면에서는 바뀐 조건으로 다시 찾는다
  const applySheet = (next: Conditions) => {
    setConditions(next);
    setSheetOpen(false);
  };

  const onSuggestion = (s: SituationSuggestion) => {
    if (s.type === 'WIDEN' && s.regionId !== null && region) {
      setWiden({ from: region.regionId, to: s.regionId });
      return;
    }
    setConditions(withoutCondition(conditions, s));
  };

  const footer =
    step === 'input' ? (
      <Button disabled={text.trim().length < 2} onClick={() => void read(text)}>
        맞춤 추천 받기
      </Button>
    ) : step === 'reading' ? (
      <Button disabled>조건 읽는 중…</Button>
    ) : step === 'conditions' ? (
      <Button disabled={conditionCount(conditions) === 0} onClick={() => setStep('result')}>
        이 조건으로 추천 받기
      </Button>
    ) : step === 'notFound' ? (
      <Button onClick={startOver}>다시 입력하기</Button>
    ) : undefined;

  return (
    <Screen inTab footer={footer}>
      <AppHeader
        title="추천맛집"
        onBack={step === 'result' ? () => setStep('conditions') : undefined}
      />
      <div className={styles.content}>
        <div className={styles.topRow}>
          <RegionChip region={region} onClick={() => setRegionOpen(true)} />
          {step !== 'result' && (
            <button type="button" className={styles.situationButton} onClick={startOver}>
              <span aria-hidden="true">✎</span> 내 상황으로 추천
            </button>
          )}
        </div>

        {regionError ? (
          <EmptyState title="내 동네를 불러오지 못했어요" onRetry={retry} />
        ) : step === 'result' ? (
          <ResultView
            conditions={conditions}
            data={result.data}
            error={result.error}
            onRetry={result.reload}
            onEdit={() => setSheetOpen(true)}
            onSuggestion={onSuggestion}
          />
        ) : (
          <>
            <h2 className={styles.title}>이 동네의 다음 한 끼</h2>
            <p className={styles.subtitle}>지금 상황을 적으면, 그 상황에 맞는 순서로 보여드려요.</p>

            <section className={styles.card} aria-label="상황 입력">
              <label htmlFor="situation-text" className={styles.cardTitle}>
                지금 어떤 상황이에요?
              </label>
              <div className={styles.inputBox} data-filled={text.length > 0}>
                <textarea
                  id="situation-text"
                  ref={input}
                  value={text}
                  rows={step === 'input' ? 2 : 1}
                  maxLength={MAX_SITUATION_TEXT}
                  placeholder="예) 부모님이랑 주말 점심, 아빠가 매운 거 못 드셔"
                  readOnly={step === 'reading'}
                  onChange={(e) => {
                    setText(e.target.value.slice(0, MAX_SITUATION_TEXT));
                    if (step !== 'input') setStep('input');
                  }}
                />
                {step === 'input' && (
                  <span className={styles.counter}>
                    {[...text].length} / {MAX_SITUATION_TEXT}
                  </span>
                )}
              </div>
              {step === 'input' && text.length === 0 && (
                <>
                  <p className={styles.examplesLabel}>이렇게 눌러서 시작해도 돼요</p>
                  <Examples
                    items={SITUATION_EXAMPLES}
                    onPick={(ex) => {
                      setText(ex);
                      void read(ex);
                    }}
                  />
                </>
              )}
            </section>
            {step === 'input' && (
              <p className={styles.privacy}>적은 문장은 이번 추천에만 쓰고 저장하지 않아요.</p>
            )}

            {step === 'reading' && <ReadingCard slow={slow} onCancel={cancelReading} />}
            {step === 'conditions' && (
              <UnderstoodCard
                conditions={conditions}
                ai={parsed?.source === 'AI'}
                onChange={setConditions}
                onAdd={() => setSheetOpen(true)}
              />
            )}
            {step === 'notFound' && (
              <NotFoundCard
                onPick={(ex) => {
                  setText(ex);
                  void read(ex);
                }}
              />
            )}
          </>
        )}
      </div>
      <ConditionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        value={conditions}
        initial={parsed?.conditions ?? EMPTY_CONDITIONS}
        onApply={applySheet}
      />
      <RegionSelectSheet open={regionOpen} onClose={() => setRegionOpen(false)} />
    </Screen>
  );
}

/** ⑥ 제안을 눌렀을 때 그 조건을 뺀 조건 */
function withoutCondition(c: Conditions, s: SituationSuggestion): Conditions {
  switch (s.kind) {
    case 'WHO':
      return { ...c, who: null };
    case 'WHEN':
      return { ...c, when: null };
    case 'WEATHER':
      return { ...c, weather: null };
    case 'CRAVING':
      return { ...c, craving: c.craving.filter((v) => v !== s.condition) };
    case 'EXCLUDE':
      return { ...c, exclude: c.exclude.filter((v) => v !== s.condition) };
    case 'IMPORTANT':
      return { ...c, important: c.important.filter((v) => v !== s.condition) };
    default:
      return c;
  }
}

function Examples({ items, onPick }: { items: string[]; onPick: (text: string) => void }) {
  return (
    <div className={styles.examples}>
      {items.map((ex) => (
        <button key={ex} type="button" onClick={() => onPick(ex)}>
          {ex}
        </button>
      ))}
    </div>
  );
}

/** ② 조건 읽는 중 */
function ReadingCard({ slow, onCancel }: { slow: boolean; onCancel: () => void }) {
  return (
    <section className={styles.card} aria-busy="true" aria-label="상황을 읽고 있어요">
      <p className={styles.cardHead}>
        상황을 읽고 있어요…<span className={styles.aiBadge}>AI 분석</span>
      </p>
      <div className={styles.skeleton} aria-hidden="true">
        {[64, 46, 100, 70].map((w) => (
          <span key={w}>
            <i />
            <b style={{ width: `${w}%` }} />
          </span>
        ))}
      </div>
      {slow ? (
        <div className={styles.slow} role="status">
          <span>조금 더 걸리고 있어요</span>
          <button type="button" className={styles.textButton} onClick={onCancel}>
            취소
          </button>
        </div>
      ) : (
        <p className={styles.cardNote}>
          누구랑 · 언제 · 빼고 싶은 것 · 중요한 것을 찾는 중이에요. 보통 2초 안에 끝나요.
        </p>
      )}
    </section>
  );
}

/** 이해한 조건 (칩 ✕로 빼고, "+ 조건 추가"로 ③ 시트) */
function UnderstoodCard({
  conditions: c,
  ai,
  onChange,
  onAdd,
}: {
  conditions: Conditions;
  ai: boolean;
  onChange: (next: Conditions) => void;
  onAdd: () => void;
}) {
  const remove = (label: string, next: Conditions, tone?: 'red') => (
    <button
      key={label}
      type="button"
      className={styles.condChip}
      data-tone={tone}
      aria-label={`${label} 빼기`}
      onClick={() => onChange(next)}
    >
      {label}
      <span aria-hidden="true">✕</span>
    </button>
  );
  const rows = [
    {
      name: '누구랑',
      chips: c.who ? [remove(labelOf(WHO_OPTIONS, c.who), { ...c, who: null })] : [],
    },
    {
      name: '언제',
      chips: c.when ? [remove(labelOf(WHEN_OPTIONS, c.when), { ...c, when: null })] : [],
    },
    // 날씨·먹고 싶어요는 찾았을 때만 줄을 보여 준다 (피그마는 4줄)
    ...(c.weather
      ? [
          {
            name: '날씨',
            chips: [remove(labelOf(WEATHER_OPTIONS, c.weather), { ...c, weather: null })],
          },
        ]
      : []),
    ...(c.craving.length > 0
      ? [
          {
            name: '먹고 싶어요',
            chips: c.craving.map((v) =>
              remove(labelOf(CRAVING_OPTIONS, v), {
                ...c,
                craving: c.craving.filter((x) => x !== v),
              }),
            ),
          },
        ]
      : []),
    {
      name: '빼기',
      chips: c.exclude.map((v) =>
        remove(
          labelOf(EXCLUDE_OPTIONS, v),
          { ...c, exclude: c.exclude.filter((x) => x !== v) },
          'red',
        ),
      ),
    },
    {
      name: '중요해요',
      chips: c.important.map((v) =>
        remove(labelOf(IMPORTANT_OPTIONS, v), {
          ...c,
          important: c.important.filter((x) => x !== v),
        }),
      ),
    },
  ];

  return (
    <section className={styles.card} aria-label="이렇게 이해했어요">
      <p className={styles.cardHead}>
        이렇게 이해했어요{ai && <span className={styles.aiBadge}>AI 분석</span>}
      </p>
      <dl className={styles.condRows}>
        {rows.map((row, i) => (
          <div key={row.name}>
            <dt>{row.name}</dt>
            <dd>
              {row.chips}
              {row.chips.length === 0 && i < rows.length - 1 && (
                <span className={styles.condEmpty}>없음</span>
              )}
              {i === rows.length - 1 && (
                <button type="button" className={styles.addChip} onClick={onAdd}>
                  + 조건 추가
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** ⑤ 조건을 찾지 못함 */
function NotFoundCard({ onPick }: { onPick: (text: string) => void }) {
  return (
    <section className={styles.notFound} aria-label="조건을 찾지 못했어요">
      <p className={styles.notFoundTitle}>조건을 찾지 못했어요</p>
      <p className={styles.notFoundText}>
        누구랑 가는지, 언제인지, 피하고 싶은 음식을 함께 적으면 더 잘 맞춰 드려요.
      </p>
      <p className={styles.examplesLabel}>이렇게 적어 보세요</p>
      <Examples items={RETRY_EXAMPLES} onPick={onPick} />
      <Link to="/recommendations" className={styles.plainLink}>
        그냥 평소 추천 보기 ›
      </Link>
    </section>
  );
}

/** 결과 화면 칩: 누구랑 · 언제 · 날씨 · 먹고 싶어요 묶음 · 중요해요 묶음 · 빼기 */
function conditionChips(c: Conditions) {
  const important = c.important.map(
    (v) => IMPORTANT_OPTIONS.find((o) => o.value === v)?.short ?? v,
  );
  return [
    ...(c.who ? [{ label: labelOf(WHO_OPTIONS, c.who), red: false }] : []),
    ...(c.when ? [{ label: labelOf(WHEN_OPTIONS, c.when), red: false }] : []),
    ...(c.weather ? [{ label: labelOf(WEATHER_OPTIONS, c.weather), red: false }] : []),
    ...(c.craving.length > 0
      ? [{ label: c.craving.map((v) => labelOf(CRAVING_OPTIONS, v)).join('·'), red: false }]
      : []),
    ...(important.length > 0 ? [{ label: important.join('·'), red: false }] : []),
    ...c.exclude.map((v) => ({ label: `${labelOf(EXCLUDE_OPTIONS, v)} 빼기`, red: true })),
  ];
}

/** 상황 맞춤 결과 (+ ⑥ 딱 맞는 가게 없음) */
function ResultView({
  conditions,
  data,
  error,
  onRetry,
  onEdit,
  onSuggestion,
}: {
  conditions: Conditions;
  data: SituationResult | undefined;
  error: unknown;
  onRetry: () => void;
  onEdit: () => void;
  onSuggestion: (s: SituationSuggestion) => void;
}) {
  const [fitItem, setFitItem] = useState<SituationItem | null>(null);

  if (error) return <EmptyState title={errorMessage(error)} onRetry={onRetry} />;
  if (!data) return <Loading label="상황에 맞는 가게를 찾는 중" />;

  const place = data.region.dongName
    ? `${data.region.sigunguName} · ${data.region.dongName}`
    : `${data.region.sigunguName} 전체`;

  return (
    <>
      <div className={styles.resultHead}>
        <h2>{data.title}</h2>
        <button type="button" className={styles.textButton} onClick={onEdit}>
          조건 수정
        </button>
      </div>
      <ul className={styles.resultChips} aria-label="적용한 조건">
        {conditionChips(conditions).map((chip) => (
          <li key={chip.label} data-tone={chip.red ? 'red' : undefined}>
            {chip.label}
          </li>
        ))}
      </ul>
      <p className={styles.notice}>
        {data.region.level === 2 && `${place}에서 찾았어요. `}맛 별점은 모두 같고, 순서만 지금
        상황에 맞췄어요.
      </p>

      {data.items.length === 0 ? (
        <section className={styles.card} aria-label="조건에 딱 맞는 가게가 없어요">
          <p className={styles.noMatchTitle}>조건에 딱 맞는 가게가 없어요</p>
          <p className={styles.cardNote}>
            조건 {conditionCount(conditions)}개를 모두 맞추는 가게가 {place}에 아직 없어요.
            {data.suggestions.length > 0
              ? ' 하나만 빼면 이만큼 볼 수 있어요.'
              : ' 조건을 줄이거나 다른 동네에서 찾아보세요.'}
          </p>
          {data.suggestions.length > 0 && (
            <ul className={styles.suggestions}>
              {data.suggestions.map((s) => (
                <li key={s.label}>
                  <button type="button" onClick={() => onSuggestion(s)}>
                    <strong>{s.label}</strong>
                    <span>{s.count}곳 보기 ›</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" size="sm" onClick={onEdit}>
            조건 직접 수정하기
          </Button>
        </section>
      ) : (
        <ul className={styles.results}>
          {data.items.map((item) => (
            <li key={item.restaurantId}>
              <ResultCard item={item} title={data.title} onFit={() => setFitItem(item)} />
            </li>
          ))}
        </ul>
      )}

      {fitItem && (
        <FitSheet
          open
          onClose={() => setFitItem(null)}
          name={fitItem.name}
          ratingScore={fitItem.rating.score}
          fitScore={fitItem.fitScore}
          reasons={fitItem.reasons}
        />
      )}
    </>
  );
}

function ResultCard({
  item,
  title,
  onFit,
}: {
  item: SituationItem;
  title: string;
  onFit: () => void;
}) {
  // ⑦ 상세의 "…에 맞는 이유" 카드로 넘긴다
  const situation: SituationContext = { title, fitScore: item.fitScore, reasons: item.reasons };
  const score = formatScore(item.rating.score);
  const myOverall = formatScore(item.myOverallScore);
  const distance = formatDistance(item.distanceM);
  const tags = [...(item.conquestState === 'CONQUERED' ? ['정복 완료'] : []), ...item.tags];
  return (
    <article className={styles.result}>
      <div className={styles.resultTop}>
        {/* 카드 전체가 눌리도록 이름 링크를 카드 위로 넓힌다 (적합도 버튼은 그 위) */}
        <Link
          to={`/restaurants/${item.restaurantId}`}
          state={{ situation }}
          className={styles.resultName}
        >
          {item.name}
        </Link>
        <button type="button" className={styles.fitPill} onClick={onFit}>
          상황 적합 {item.fitScore}%
        </button>
      </div>
      <p className={styles.resultMeta}>
        <span className={styles.star}>★</span> {score ? `${score} 맛` : '아직 별점 없음'}
        {myOverall && (
          <>
            {' · '}
            <span className={styles.myOverall}>내 종합 {myOverall}</span>
          </>
        )}
        {distance && ` · ${distance}`}
      </p>
      {item.why && (
        <p className={styles.why}>
          <b>왜?</b> {item.why}
        </p>
      )}
      {tags.length > 0 && (
        <ul className={styles.tags}>
          {tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
