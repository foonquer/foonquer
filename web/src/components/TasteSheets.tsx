import { useNavigate } from 'react-router';
import type { MyOverall } from '../api/restaurants';
import { formatScore } from '../lib/format';
import { TASTE_CRITERIA, TASTE_CRITERIA_NOTE, TASTE_ITEMS, tasteCriterion } from '../lib/taste';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import styles from './TasteSheets.module.css';

type CriteriaProps = {
  open: boolean;
  onClose: () => void;
  /** 이 점수의 줄을 칠한다 (별점을 고르는 중 / 가게 맛 별점) */
  score?: number | null;
  /** 제목 뒤에 붙일 말 (예: "새맛집은 4.0점대") */
  caption?: string;
};

/** 먹장깨기 맛 기준 (10단계) 시트 */
export function TasteCriteriaSheet({ open, onClose, score, caption }: CriteriaProps) {
  const current = score ? tasteCriterion(score).score : null;
  return (
    <BottomSheet open={open} onClose={onClose} label="먹장깨기 맛 기준">
      <h2 className={styles.title}>
        먹장깨기 맛 기준{caption && <span className={styles.caption}> · {caption}</span>}
      </h2>
      <p className={styles.note}>{TASTE_CRITERIA_NOTE}</p>
      <ul className={styles.criteria}>
        {TASTE_CRITERIA.map((c) => (
          <li key={c.score} data-current={c.score === current} data-low={c.score < 3}>
            <span className={styles.criteriaScore}>{c.score.toFixed(1)}</span>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
      <Button onClick={onClose}>확인했어요</Button>
    </BottomSheet>
  );
}

type OverallProps = {
  open: boolean;
  onClose: () => void;
  tasteScore: number | null;
  myOverall: MyOverall;
};

/** 내 종합 별점 계산 보기 시트 (항목 · 이 가게 평균 · 내 비중 · 계산식) */
export function MyOverallSheet({ open, onClose, tasteScore, myOverall }: OverallProps) {
  const navigate = useNavigate();
  const used = myOverall.items.filter((i) => i.average !== null && i.weightPercent !== null);
  const formula = used
    .map(
      (i) =>
        `${formatScore(i.average)}×${((i.weightPercent ?? 0) / 100).toFixed(2).replace(/0$/, '')}`,
    )
    .join(' + ');
  const labelOf = (key: string) => TASTE_ITEMS.find((t) => t.key === key)?.label ?? key;
  // 막대는 가장 큰 비중을 끝까지 채운다
  const maxPercent = Math.max(1, ...myOverall.items.map((i) => i.weightPercent ?? 0));

  return (
    <BottomSheet open={open} onClose={onClose} label="내 종합 별점">
      <h2 className={styles.title}>
        내 종합 별점{' '}
        {myOverall.score !== null && (
          <span className={styles.big}>
            <span className={styles.star}>★</span> {formatScore(myOverall.score)}
          </span>
        )}
      </h2>
      <p className={styles.note}>
        단순 평균이 아니라, 내가 중요하게 보는 항목에 더 큰 비중을 둬서 계산해요.
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">항목</th>
            <th scope="col">이 가게 평균</th>
            <th scope="col">내 비중</th>
          </tr>
        </thead>
        <tbody>
          {myOverall.items.map((i) => (
            <tr key={i.key}>
              <th scope="row">{labelOf(i.key)}</th>
              <td>{formatScore(i.average) ?? '–'}</td>
              <td>
                <span className={styles.bar} aria-hidden="true">
                  <span
                    style={{ width: `${((i.weightPercent ?? 0) / maxPercent) * 100}%` }}
                    data-strong={i.weightPercent === maxPercent}
                  />
                </span>
                <span className={styles.percent}>
                  {i.weightPercent === null ? '평가 없음' : `${i.weightPercent}%`}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {myOverall.score !== null && (
        <div className={styles.formula}>
          <p>
            {formula} = {formatScore(myOverall.score)}
          </p>
          <p className={styles.formulaNote}>
            같은 가게도 사람마다 내 종합 별점이 달라요. 맛 별점
            {tasteScore !== null && `(★ ${formatScore(tasteScore)})`}은 모두에게 같아요.
          </p>
        </div>
      )}
      <div className={styles.buttons}>
        <Button variant="soft" onClick={() => navigate('/me/taste')}>
          내 취향 바꾸기
        </Button>
        <Button onClick={onClose}>확인했어요</Button>
      </div>
    </BottomSheet>
  );
}
