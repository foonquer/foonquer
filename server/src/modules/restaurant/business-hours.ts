import { z } from 'zod';

// restaurant.business_hours (카카오 API는 영업시간을 주지 않아 직접 입력한 가게만 있다)
// 형식: 요일(mon~sun)별 영업 구간 배열, 한국 시간 24시간제. 빈 배열은 휴무, 점심·저녁 따로 영업하면 2개.
// 예) {"mon":[{"open":"11:00","close":"21:00"}],"sun":[]}  · 닫는 시각이 여는 시각보다 이르면 다음 날 새벽까지 영업

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type Day = (typeof DAYS)[number];

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/);
const interval = z.object({ open: time, close: time });
const schema = z.object(
  Object.fromEntries(DAYS.map((d) => [d, z.array(interval).optional()])) as Record<
    Day,
    z.ZodOptional<z.ZodArray<typeof interval>>
  >,
);

type Interval = z.infer<typeof interval>;
export type BusinessHours = Record<Day, Interval[]>;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function minutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** DB 값을 응답 형식(mon~sun 7개 키)으로. 형식이 맞지 않으면 null (화면에서 숨김) */
export function parseBusinessHours(value: unknown): BusinessHours | null {
  if (value === null || value === undefined) return null;
  const parsed = schema.safeParse(value);
  if (!parsed.success) return null;
  const hours = {} as BusinessHours;
  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const) {
    hours[day] = parsed.data[day] ?? [];
  }
  return hours;
}

/**
 * 지금(KST) 영업 중인지와 오늘 여는·닫는 시각 (MAP-02, REST-01 businessStatus).
 * 오늘 구간이 여러 개면 첫 구간의 여는 시각과 마지막 구간의 닫는 시각. 오늘 휴무면 둘 다 null.
 */
export function businessStatusOf(hours: BusinessHours | null, now = new Date()) {
  if (!hours) return null;
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const today = DAYS[kst.getUTCDay()];
  const yesterday = DAYS[(kst.getUTCDay() + 6) % 7];
  const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();

  const openToday = hours[today].some(({ open, close }) => {
    const o = minutes(open);
    const c = minutes(close);
    return c > o ? o <= nowMin && nowMin < c : o <= nowMin; // 자정을 넘기는 구간은 오늘 여는 시각 이후
  });
  const openFromYesterday = hours[yesterday].some(({ open, close }) => {
    const o = minutes(open);
    const c = minutes(close);
    return c <= o && nowMin < c; // 어제 열어 오늘 새벽에 닫는 구간
  });

  const todays = hours[today];
  return {
    isOpen: openToday || openFromYesterday,
    todayOpenTime: todays[0]?.open ?? null,
    todayCloseTime: todays.at(-1)?.close ?? null,
  };
}
