import { z } from 'zod';
import { env } from '../../config/env';
import { truncateChars } from '../../common/text';
import {
  type Conditions,
  conditionCount,
  conditionsSchema,
  DEFAULT_IMPORTANT,
  EMPTY_CONDITIONS,
  EXCLUDE,
  EXCLUDE_CODES,
  type ExcludeCode,
  IMPORTANT,
  IMPORTANT_CODES,
  type Important,
  MAX_IMPORTANT,
  titleOf,
  WHEN,
  WHEN_CODES,
  WHO,
  WHO_CODES,
  type Who,
} from './situation-conditions';

// 상황 문장 → 조건 (피그마 3-4 개발 메모 2·3번). 원문은 저장하지 않고 이번 요청에만 쓴다.
// Gemini가 있으면 값 목록(enum) 안에서만 고르게 하고, 키가 없거나 실패하면 키워드 규칙으로 읽는다.

export const MAX_TEXT = 60;

/** 전화번호·이메일을 지우고 공백을 줄인 뒤 60자로 자른다 (AI에 보내기 전) */
export function sanitizeSituation(text: string) {
  const cleaned = text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, ' ')
    .replace(/(\+?82[-.\s]?)?0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return truncateChars(cleaned, MAX_TEXT);
}

// ── 키워드 규칙 ──────────────────────────────────────────────

const NOT = '.{0,8}(못|싫|안 ?먹|빼|말고|별로|없는|없이|피하|제외)';

const WHO_RULES: [Who, RegExp][] = [
  ['KIDS', /(아이(와|랑|들|가|를|도|\s)|아기|애기|아들|딸(이|아이|래)|키즈|유아|어린이)/],
  ['FAMILY', /(부모님|가족|엄마|아빠|어머니|아버지|할머니|할아버지|어르신|시댁|처가)/],
  ['GROUP', /(회식|단체|모임|여럿|[1-9]\d\s?명|[5-9]\s?명)/],
  ['COUPLE', /(데이트|연인|여자 ?친구|남자 ?친구|여친|남친|애인|썸)/],
  ['FRIEND', /(친구|동기|동창)/],
  ['SOLO', /(혼자|혼밥|1인|한 ?명)/],
];

const EXCLUDE_RULES: [ExcludeCode, RegExp][] = [
  ['SPICY', new RegExp(`((매운|맵|매워|자극적)${NOT}|안 ?매운|안 ?맵|맵지 ?않|순한)`)],
  ['RAW', new RegExp(`((회|날것|날 ?것|생선회|육회|초밥|스시)${NOT})`)],
  ['BAR', new RegExp(`((술집|술|시끄러운)${NOT})`)],
  ['LONG_WAIT', /((웨이팅|대기|줄)(.{0,8}(못|싫|빼|말고|없는|없이|짧|안 ?서)|\s?없)|바로 ?들어)/],
];

const IMPORTANT_RULES: [Important, RegExp][] = [
  ['SPACIOUS', /(넓|넉넉|자리 ?많|편하게 ?앉)/],
  ['ROOM', /(룸|단체석|개별실|프라이빗|따로 ?앉)/],
  ['PARKING', /(주차|차 ?가지고|차로|운전)/],
  ['QUIET', /(조용|한적|차분|대화)/],
  ['KIND', /(친절)/],
  ['SOLO_FRIENDLY', /(혼밥)/],
  ['VALUE', /(가성비|저렴|싸게|싼 ?곳|가격)/],
  ['FAST', /(빨리|빠르게|빠른|금방|급하|시간 ?없)/],
];

function whenOf(text: string): Conditions['when'] {
  if (/(늦은 ?밤|야식|새벽|심야|밤늦게|밤 ?늦|2차)/.test(text)) return 'LATE_NIGHT';
  if (/(저녁|퇴근|디너)/.test(text)) return 'DINNER';
  if (/(점심|낮|브런치|런치)/.test(text)) {
    return /(주말|토요일|일요일|토욜|일욜|휴일)/.test(text) ? 'WEEKEND_LUNCH' : 'WEEKDAY_LUNCH';
  }
  return null;
}

/** 키워드 규칙으로 읽기 (Gemini가 없거나 실패했을 때) */
export function parseByRules(text: string): Conditions {
  return {
    who: WHO_RULES.find(([, re]) => re.test(text))?.[0] ?? null,
    when: whenOf(text),
    exclude: EXCLUDE_RULES.filter(([, re]) => re.test(text)).map(([code]) => code),
    important: IMPORTANT_RULES.filter(([, re]) => re.test(text)).map(([code]) => code),
  };
}

// ── Gemini ──────────────────────────────────────────────────

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const list = (o: Record<string, string>) =>
  Object.entries(o)
    .map(([code, label]) => `${code}(${label})`)
    .join(', ');

const SYSTEM = [
  '너는 맛집 추천 앱의 상황 이해 도우미다. 사용자가 지금 상황을 한 문장으로 적으면, 아래 값 목록 안에서만 골라 조건으로 바꾼다.',
  `who 누구랑(하나 또는 null): ${list(WHO)}`,
  `when 언제(하나 또는 null): ${list(WHEN)}`,
  `exclude 빼고 싶은 것(여러 개): ${list(EXCLUDE)}`,
  `important 중요한 것(최대 ${MAX_IMPORTANT}개): ${list(IMPORTANT)}`,
  '문장에 분명히 드러난 것만 고른다. 예) "아빠가 매운 거 못 드셔" → exclude SPICY. "매운 거 먹고 싶어"는 SPICY를 빼는 게 아니다.',
  '목록에 맞는 값이 없으면 고르지 않는다 (who·when은 null, 배열은 빈 배열). 지어내지 않는다.',
].join('\n');

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    who: { type: 'STRING', enum: WHO_CODES, nullable: true },
    when: { type: 'STRING', enum: WHEN_CODES, nullable: true },
    exclude: { type: 'ARRAY', items: { type: 'STRING', enum: EXCLUDE_CODES } },
    important: { type: 'ARRAY', items: { type: 'STRING', enum: IMPORTANT_CODES } },
  },
  required: ['who', 'when', 'exclude', 'important'],
};

// AI가 목록 밖 값이나 6개 이상을 주면 버리거나 자른다 (전체를 버리지 않는다)
const aiAnswer = z.object({
  who: z.enum(WHO_CODES).nullable().catch(null),
  when: z.enum(WHEN_CODES).nullable().catch(null),
  exclude: z.array(z.string()).catch([]),
  important: z.array(z.string()).catch([]),
});

type GenerateResponse = { candidates?: { content?: { parts?: { text?: string }[] } }[] };

/** Gemini로 읽기. 키가 없거나 실패하면 null (규칙으로 읽는다). 테스트에서는 fetch를 바꿔 끼운다 */
async function parseByAi(text: string): Promise<Conditions | null> {
  if (!env.GEMINI_API_KEY) return null;
  try {
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
      // 화면 목표 2초, 5초부터 "조금 더 걸리고 있어요" — 8초 넘으면 규칙으로 읽는다
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.error(`Gemini 상황 읽기 실패: ${res.status}`);
      return null;
    }
    const body = (await res.json()) as GenerateResponse;
    const answer = aiAnswer.parse(
      JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? ''),
    );
    return conditionsSchema.parse({
      ...answer,
      exclude: answer.exclude.filter((c): c is ExcludeCode => c in EXCLUDE),
      important: answer.important
        .filter((c): c is Important => c in IMPORTANT)
        .slice(0, MAX_IMPORTANT),
    });
  } catch (err) {
    console.error('Gemini 상황 읽기 호출 실패', err);
    return null;
  }
}

/**
 * 상황 문장 → 조건. 하나도 못 찾으면 found = false (화면 ⑤).
 * 중요해요가 없으면 누구랑에 따라 보통 중요한 것을 미리 골라 둔다 (사용자가 ③ 시트에서 끌 수 있다).
 */
export async function parseSituation(text: string) {
  const clean = sanitizeSituation(text);
  const ai = clean ? await parseByAi(clean) : null;
  const parsed = ai ?? (clean ? parseByRules(clean) : EMPTY_CONDITIONS);
  const found = conditionCount(parsed) > 0;
  const conditions =
    found && parsed.who && parsed.important.length === 0
      ? { ...parsed, important: DEFAULT_IMPORTANT[parsed.who] }
      : parsed;
  return {
    found,
    conditions: found ? conditions : EMPTY_CONDITIONS,
    title: found ? titleOf(conditions) : null,
    /** AI면 화면에 "AI 분석" 표시 */
    source: ai ? ('AI' as const) : ('RULE' as const),
  };
}
