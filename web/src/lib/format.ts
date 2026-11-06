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

/** "2026-09-21T12:00:00+09:00" → "9.21" */
export function formatMonthDay(iso: string | null | undefined) {
  if (!iso) return null;
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[1])}.${Number(m[2])}` : null;
}

/** "2026-09-25T12:34:00+09:00" → "2026.09.25 12:34" (영수증 결제 시각) */
export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}` : null;
}

/** 12000 → "12,000원" */
export function formatWon(amount: number | null | undefined) {
  return amount === null || amount === undefined ? null : `${amount.toLocaleString('ko-KR')}원`;
}

/** 1280 → "1,280P" */
export function formatPoint(point: number) {
  return `${point.toLocaleString('ko-KR')}P`;
}

/** "2026-09-25T…" → "9월 25일" */
export function formatKoreanDate(iso: string | null | undefined) {
  if (!iso) return null;
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : null;
}

/** KST 날짜 "YYYY-MM-DD" */
function kstDay(date: Date) {
  return new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 정복한 날: "오늘" / "어제" / "9월 20일" */
export function formatRecentDay(iso: string | null | undefined, now = new Date()) {
  if (!iso) return null;
  const day = iso.slice(0, 10);
  if (day === kstDay(now)) return '오늘';
  if (day === kstDay(new Date(now.getTime() - 86_400_000))) return '어제';
  return formatKoreanDate(iso);
}

/** "2026-09-01" ~ "2027-02-28" → "2026.9 ~ 2027.2" */
export function formatSeasonRange(season: { startDate: string; endDate: string }) {
  const ym = (d: string) => `${d.slice(0, 4)}.${Number(d.slice(5, 7))}`;
  return `${ym(season.startDate)} ~ ${ym(season.endDate)}`;
}
