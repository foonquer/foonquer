// 명세서 "값 규칙": DB는 UTC로 저장하고, 응답 시각은 ISO 8601 KST(+09:00), 날짜만은 YYYY-MM-DD(KST)로 준다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** UTC 기준으로 날짜·시각 부분을 꺼낸다 */
function parts(date: Date) {
  return {
    y: date.getUTCFullYear(),
    mo: pad(date.getUTCMonth() + 1),
    d: pad(date.getUTCDate()),
    h: pad(date.getUTCHours()),
    mi: pad(date.getUTCMinutes()),
    s: pad(date.getUTCSeconds()),
  };
}

/** 2026-10-06T13:02:11+09:00 (밀리초는 버린다) */
export function toKstIso(date: Date): string {
  const p = parts(new Date(date.getTime() + KST_OFFSET_MS));
  return `${p.y}-${p.mo}-${p.d}T${p.h}:${p.mi}:${p.s}+09:00`;
}

/** null이면 null, 아니면 toKstIso */
export function toKstIsoOrNull(date: Date | null | undefined): string | null {
  return date ? toKstIso(date) : null;
}

/** 어떤 순간이 KST로 며칠인지 → YYYY-MM-DD */
export function toKstDate(date: Date): string {
  const p = parts(new Date(date.getTime() + KST_OFFSET_MS));
  return `${p.y}-${p.mo}-${p.d}`;
}

/**
 * DB의 DATE 컬럼(@db.Date) 값 → YYYY-MM-DD.
 * Prisma는 DATE를 그 날짜의 UTC 0시 Date로 돌려주므로 UTC로 읽어야 하루가 밀리지 않는다.
 */
export function formatDbDate(date: Date): string {
  const p = parts(date);
  return `${p.y}-${p.mo}-${p.d}`;
}

/** DB의 DATE 값이 가리키는 날의 KST 0시(순간) */
export function kstStartOfDbDate(date: Date): Date {
  return new Date(date.getTime() - KST_OFFSET_MS);
}

/** 지금 KST 날짜를 DB DATE 비교용 Date(UTC 0시)로. 예) KST 2026-10-06 → 2026-10-06T00:00:00Z */
export function kstTodayAsDbDate(now = new Date()): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
}

/** 화면 문구용 KST 날짜. 예) 2026-11-05T04:00:00Z → '11월 5일' */
export function toKoreanMonthDay(date: Date): string {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

/** 오늘(KST) 0시의 순간 */
export function kstStartOfToday(now = new Date()): Date {
  return kstStartOfDbDate(kstTodayAsDbDate(now));
}

/** 이번 달(KST) 1일 0시의 순간 */
export function kstStartOfMonth(now = new Date()): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - KST_OFFSET_MS);
}

/** 두 순간 사이의 KST 날짜 차이 (b − a, 일) */
export function kstDaysBetween(a: Date, b: Date): number {
  return Math.round((kstTodayAsDbDate(b).getTime() - kstTodayAsDbDate(a).getTime()) / DAY_MS);
}
