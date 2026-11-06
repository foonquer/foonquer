// 화면에 보여 줄 숫자·날짜 모양

/** 410 → "410m", 1234 → "1.2km" */
export function formatDistance(meters: number | null | undefined) {
  if (meters === null || meters === undefined) return null;
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1).replace(/\.0$/, '')}km`;
}

/** 4.62 → "4.6" (리뷰가 없으면 null) */
export function formatScore(score: number | null | undefined) {
  return score === null || score === undefined ? null : score.toFixed(1);
}

/** "2026-09-14T12:00:00+09:00" → "2026.9.14" */
export function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}.${Number(m[2])}.${Number(m[3])}` : null;
}

/** 빈 값을 빼고 " · "로 잇는다 */
export function joinDot(parts: (string | null | undefined | false)[]) {
  return parts.filter(Boolean).join(' · ');
}
