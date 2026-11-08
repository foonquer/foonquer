import { useState } from 'react';
import type { RestaurantDetail } from '../../api/restaurants';
import { MyOverallSheet } from '../../components/TasteSheets';
import { formatScore } from '../../lib/format';
import { TASTE_ITEMS } from '../../lib/taste';
import styles from './RestaurantDetailPage.module.css';

const SCORE_ITEMS = [
  { key: 'cleanliness', label: '청결' },
  { key: 'portion', label: '양' },
  { key: 'service', label: '서비스' },
  { key: 'price', label: '가격' },
] as const;

/** 비중이 가장 큰 항목들. 모두 같으면 null ("맛·청결 중시") */
function emphasisOf(r: RestaurantDetail) {
  const percents = r.myOverall.items.map((i) => i.weightPercent ?? 0);
  const max = Math.max(...percents);
  if (max - Math.min(...percents) <= 1) return null;
  return r.myOverall.items
    .filter((i) => (i.weightPercent ?? 0) === max)
    .map((i) => TASTE_ITEMS.find((t) => t.key === i.key)?.label)
    .join('·');
}

/** 항목별 평균 카드: 내 종합 · 청결 · 양 · 서비스 · 가격 · 재방문 의사 + 계산 보기 시트 (피그마 3-2 A·C) */
export function ScoreStats({ r }: { r: RestaurantDetail }) {
  const [open, setOpen] = useState(false);
  const percent = (v: number | null) => (v === null ? '–' : `${v}%`);
  // 인증 평가가 하나도 없으면 "–" 칸 대신 한 줄로
  if (r.rating.reviewCount === 0) {
    return (
      <section className={styles.statsCard} aria-label="항목별 평가">
        <p className={styles.statsEmpty}>
          아직 항목별 평가가 없어요. 첫 방문 인증의 별점부터 여기에 모여요.
        </p>
      </section>
    );
  }

  const emphasis = emphasisOf(r);
  return (
    <section className={styles.statsCard} aria-label="항목별 평가">
      <div className={styles.statsHead}>
        <p>항목별 평균 · 인증 {r.rating.reviewCount}개</p>
        <p className={styles.visitRates}>
          현지인 방문 {percent(r.stats.localVisitRate)} · 재방문 {percent(r.stats.revisitRate)}
        </p>
      </div>
      <div className={styles.scores}>
        <div className={styles.score} data-tone="mine">
          <span className={styles.value}>{formatScore(r.myOverall.score) ?? '–'}</span>
          <span className={styles.label}>내 종합</span>
        </div>
        {SCORE_ITEMS.map((item) => (
          <div key={item.key} className={styles.score}>
            <span className={styles.value}>{formatScore(r.stats[item.key]) ?? '–'}</span>
            <span className={styles.label}>{item.label}</span>
          </div>
        ))}
        <div className={styles.score} data-highlight="true">
          <span className={styles.value}>{percent(r.stats.revisitIntentRate)}</span>
          <span className={styles.label}>재방문 의사</span>
        </div>
      </div>
      <p className={styles.overallNote}>
        <span>ⓘ 내 취향{emphasis && `(${emphasis} 중시)`}을 반영한 종합 별점 · 단순 평균 아님</span>
        <button type="button" onClick={() => setOpen(true)} disabled={r.myOverall.score === null}>
          계산 보기 ›
        </button>
      </p>
      <MyOverallSheet
        open={open}
        onClose={() => setOpen(false)}
        tasteScore={r.rating.score}
        myOverall={r.myOverall}
      />
    </section>
  );
}
