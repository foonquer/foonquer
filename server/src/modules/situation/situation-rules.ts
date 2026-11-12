import { type BusinessHours, isOpenAt } from '../restaurant/business-hours';
import {
  type Conditions,
  EXCLUDE,
  type ExcludeCode,
  IMPORTANT,
  type Important,
  WHEN,
  type When,
  WHO,
  type Who,
} from './situation-conditions';

// 조건마다 맞음 / 부분 / 안 맞음 판정 (피그마 3-4 개발 메모 4·5번, 서버 계산 · AI 아님).
// 근거는 인증 리뷰 글·좋았던/아쉬웠던 점·세부 별점·영업시간. 신뢰 별점 숫자는 바꾸지 않는다.
// 기준 숫자(언급 2건, 평균 4.2·3.5, 가중치 1.5, 적합 50%)는 초안 — 팀 확정 필요.

export type Status = 'MATCH' | 'PARTIAL' | 'NONE';
export type Kind = 'WHO' | 'WHEN' | 'EXCLUDE' | 'IMPORTANT';

/** 판정에 쓰는 가게 정보 */
export interface ShopSignals {
  /** 상호 + 업종 소분류 + 카테고리 (빼기 조건의 가게 단위 판정) */
  text: string;
  hours: BusinessHours | null;
  /** 세부 별점 평균 (세부 별점 리뷰 수와 함께) */
  service: { avg: number; count: number } | null;
  price: { avg: number; count: number } | null;
  /** 공개 리뷰 글과 좋았던(G)/아쉬웠던(B) 점 */
  reviews: { text: string; marks: Map<string, string> }[];
}

/** 동네 평균 (근거 "서비스 4.5 (동네 평균 +0.7)") */
export interface AreaAverages {
  service: number | null;
  price: number | null;
}

export interface Judged {
  status: Status;
  evidence: string;
  /** 빼기 조건에 걸리거나 그 시간에 문을 닫은 가게 → 후보에서 뺀다 */
  blocked?: boolean;
}

export interface Condition {
  kind: Kind;
  code: string;
  label: string;
  weight: number;
}

/** 중요해요는 무게를 조금 더 둔다 */
const IMPORTANT_WEIGHT = 1.5;
const SCORE: Record<Status, number> = { MATCH: 1, PARTIAL: 0.5, NONE: 0 };
/** 언급 n건 이상이면 맞음 */
const MATCH_MENTIONS = 2;
const DETAIL_MIN_REVIEWS = 3;
const AVG_MATCH = 4.2;
const AVG_PARTIAL = 3.5;

/** 조건 목록 (누구랑 → 언제 → 빼기 → 중요해요) */
export function conditionList(c: Conditions): Condition[] {
  return [
    ...(c.who ? [{ kind: 'WHO' as const, code: c.who, label: WHO[c.who], weight: 1 }] : []),
    ...(c.when ? [{ kind: 'WHEN' as const, code: c.when, label: WHEN[c.when], weight: 1 }] : []),
    ...c.exclude.map((code) => ({
      kind: 'EXCLUDE' as const,
      code,
      label: `${EXCLUDE[code]} 빼기`,
      weight: 1,
    })),
    ...c.important.map((code) => ({
      kind: 'IMPORTANT' as const,
      code,
      label: IMPORTANT[code],
      weight: IMPORTANT_WEIGHT,
    })),
  ];
}

/**
 * 상황 적합도(%) = Σ(무게 × 점수) / Σ무게 × 100, 점수는 맞음 1 · 부분 0.5 · 안 맞음 0.
 * skip 번째 조건은 빼고 계산한다 (⑥ "하나만 빼면"). 막힌 가게면 null
 */
export function fitOf(conds: Condition[], judged: Judged[], skip = -1) {
  let sum = 0;
  let weights = 0;
  for (const [i, cond] of conds.entries()) {
    if (i === skip) continue;
    if (judged[i].blocked) return null;
    sum += cond.weight * SCORE[judged[i].status];
    weights += cond.weight;
  }
  return weights === 0 ? null : Math.round((sum / weights) * 100);
}

// ── 리뷰 언급 ───────────────────────────────────────────────

interface MentionRule {
  pos: RegExp;
  neg?: RegExp;
  /** 좋았던 점(G) → 긍정, 아쉬웠던 점(B) → 부정으로 같이 센다 */
  aspect?: string;
  posLabel: string;
  negLabel?: string;
}

/** 리뷰마다 부정 → 긍정 순으로 한 번만 센다 ("불친절"이 "친절"로 세지지 않게) */
function countMentions(shop: ShopSignals, rule: MentionRule) {
  let pos = 0;
  let neg = 0;
  for (const r of shop.reviews) {
    const mark = rule.aspect ? r.marks.get(rule.aspect) : undefined;
    if (rule.neg?.test(r.text) || mark === 'B') neg += 1;
    else if (rule.pos.test(r.text) || mark === 'G') pos += 1;
  }
  return { pos, neg };
}

function byMentions(shop: ShopSignals, rule: MentionRule): Judged {
  const { pos, neg } = countMentions(shop, rule);
  if (neg >= MATCH_MENTIONS && neg > pos) {
    return { status: 'NONE', evidence: `${rule.negLabel} ${neg}건` };
  }
  if (pos >= MATCH_MENTIONS && neg * 3 <= pos) {
    return { status: 'MATCH', evidence: `${rule.posLabel} ${pos}건` };
  }
  const parts = [
    pos > 0 ? `${rule.posLabel} ${pos}건` : null,
    neg > 0 ? `${rule.negLabel} ${neg}건` : null,
  ].filter(Boolean);
  // 근거가 없으면 안 맞음이 아니라 "정보 부족" (부분)
  return {
    status: 'PARTIAL',
    evidence: parts.length > 0 ? parts.join(' · ') : '관련 리뷰 아직 없음',
  };
}

/** 세부 별점 평균이 충분하면 평균으로, 아니면 리뷰 언급으로 */
function byAverage(
  detail: ShopSignals['service'],
  label: string,
  areaAvg: number | null,
  fallback: () => Judged,
): Judged {
  if (!detail || detail.count < DETAIL_MIN_REVIEWS) return fallback();
  const diff = areaAvg === null ? 0 : Math.round((detail.avg - areaAvg) * 10) / 10;
  const vs = diff === 0 ? '' : ` (동네 평균 ${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)})`;
  const evidence = `${label} ${detail.avg.toFixed(1)}${vs}`;
  if (detail.avg >= AVG_MATCH) return { status: 'MATCH', evidence };
  return { status: detail.avg >= AVG_PARTIAL ? 'PARTIAL' : 'NONE', evidence };
}

// ── 조건별 규칙 ─────────────────────────────────────────────

const WHO_RULES: Record<Who, MentionRule> = {
  SOLO: { pos: /(혼밥|혼자|1인|바 ?좌석)/, posLabel: '혼밥 리뷰' },
  FRIEND: { pos: /(친구|동기|동창)/, posLabel: '친구와 간 리뷰' },
  COUPLE: { pos: /(데이트|연인|여자 ?친구|남자 ?친구|여친|남친|애인)/, posLabel: '데이트 리뷰' },
  FAMILY: {
    pos: /(부모님|가족|엄마|아빠|어머니|아버지|할머니|할아버지|어르신)/,
    posLabel: '가족 동행 리뷰',
  },
  KIDS: {
    pos: /(아이(와|랑|들|가|를|도)|아기|애기|아들|딸(이|아이|래)|키즈|유아|어린이)/,
    posLabel: '아이 동행 리뷰',
  },
  GROUP: {
    pos: /(회식|단체|모임|여럿이)/,
    neg: /(좁|협소)/,
    posLabel: '단체 방문 리뷰',
    negLabel: '좁다는 리뷰',
  },
};

const IMPORTANT_RULES: Record<Important, MentionRule> = {
  SPACIOUS: {
    pos: /(넓|자리.{0,4}(많|여유|넉넉)|좌석.{0,4}(많|넉넉)|테이블 ?간격)/,
    neg: /(좁|협소|다닥다닥|자리가 ?없)/,
    posLabel: '넓다는 리뷰',
    negLabel: '좁다는 리뷰',
  },
  ROOM: { pos: /(룸|단체석|개별실|프라이빗|좌식|방이 ?따로)/, posLabel: '룸·단체석 언급' },
  PARKING: {
    pos: /주차.{0,6}(가능|편|넓|쉬|돼|되|있|무료)/,
    neg: /주차.{0,6}(불가|어렵|힘들|없|안 ?돼|안 ?되|불편)/,
    posLabel: '주차 편하다는 리뷰',
    negLabel: '주차 어렵다는 리뷰',
  },
  QUIET: {
    pos: /(조용|한적|아늑|차분|대화하기 ?좋)/,
    neg: /(시끄|소란|북적|붐비|붐벼|정신없)/,
    posLabel: '조용하다는 리뷰',
    negLabel: '붐빈다는 리뷰',
  },
  KIND: {
    pos: /(친절|상냥|응대가 ?좋)/,
    neg: /(불친절|무뚝뚝|불쾌|응대가 ?별로)/,
    aspect: 'SERVICE',
    posLabel: '친절하다는 리뷰',
    negLabel: '불친절하다는 리뷰',
  },
  SOLO_FRIENDLY: {
    pos: /(혼밥|혼자|1인|바 ?좌석)/,
    neg: /(혼자.{0,8}(어렵|불편|눈치)|2인 ?이상)/,
    posLabel: '혼밥 리뷰',
    negLabel: '혼밥 어렵다는 리뷰',
  },
  VALUE: {
    pos: /(가성비|저렴|싸|가격 ?대비|착한 ?가격)/,
    neg: /(비싸|비싼|가격이.{0,6}(있|올랐|세))/,
    aspect: 'PRICE',
    posLabel: '가성비 좋다는 리뷰',
    negLabel: '비싸다는 리뷰',
  },
  FAST: {
    pos: /(빨리 ?나|금방 ?나|바로 ?나|빠르게 ?나|빨리 ?먹|회전이 ?빠)/,
    neg: /(늦게 ?나|오래 ?걸|한참 ?기다|느려)/,
    aspect: 'WAIT',
    posLabel: '빨리 나온다는 리뷰',
    negLabel: '오래 걸린다는 리뷰',
  },
};

interface ExcludeRule {
  /** 가게 이름·업종에 걸리면 바로 뺀다 */
  shop?: RegExp;
  hit: RegExp;
  /** 걸리는 말이 있어도 이 말이 있으면 괜찮은 리뷰로 센다 ("안 매워요") */
  safe?: RegExp;
  aspect?: string;
  /** 걸리는 리뷰가 이만큼이면 뺀다 */
  blockAt: number;
  hitLabel: string;
  safeLabel?: string;
  clean: string;
}

const EXCLUDE_RULES: Record<ExcludeCode, ExcludeRule> = {
  SPICY: {
    shop: /(마라|떡볶이|닭발|쭈꾸미|주꾸미|낙지|불닭|짬뽕|매운)/,
    hit: /(맵|매워|매운|얼얼|자극적)/,
    safe: /(안 ?매|안 ?맵|맵지 ?않|순한|담백|자극적이지 ?않)/,
    blockAt: 3,
    hitLabel: '맵다는 리뷰',
    safeLabel: '순하다는 리뷰',
    clean: '맵다는 리뷰 없음',
  },
  RAW: {
    shop: /(횟집|회\/초밥|초밥|스시|사시미|오마카세|생선회|육회|물회|회센터|참치)/,
    hit: /(사시미|초밥|스시|육회|생선회|물회|날것|활어|모둠회|회가|회는|회도)/,
    blockAt: 2,
    hitLabel: '회·날것 언급',
    clean: '회·날것 언급 없음',
  },
  BAR: {
    shop: /(주점|호프|맥주|포차|이자카야|와인|칵테일|bar)/i,
    hit: /(술집|안주|포차|술자리|2차|소주|맥주|하이볼)/,
    blockAt: 3,
    hitLabel: '술자리 언급',
    clean: '술집 분위기 언급 없음',
  },
  LONG_WAIT: {
    hit: /(웨이팅|대기|줄 ?서|줄을 ?서|오래 ?기다|한참 ?기다)/,
    safe: /(웨이팅 ?없|대기 ?없|바로 ?들어|기다리지 ?않)/,
    aspect: 'WAIT',
    blockAt: 3,
    hitLabel: '웨이팅 언급',
    safeLabel: '대기 짧다는 리뷰',
    clean: '웨이팅 언급 없음',
  },
};

function byExclude(shop: ShopSignals, rule: ExcludeRule): Judged {
  if (rule.shop?.test(shop.text)) return { status: 'NONE', evidence: '가게 정보', blocked: true };
  let hits = 0;
  let safe = 0;
  for (const r of shop.reviews) {
    const mark = rule.aspect ? r.marks.get(rule.aspect) : undefined;
    if (rule.safe?.test(r.text) || mark === 'G') safe += 1;
    else if (rule.hit.test(r.text) || mark === 'B') hits += 1;
  }
  if (hits >= rule.blockAt)
    return { status: 'NONE', evidence: `${rule.hitLabel} ${hits}건`, blocked: true };
  if (hits > 0) return { status: 'PARTIAL', evidence: `${rule.hitLabel} ${hits}건` };
  return {
    status: 'MATCH',
    evidence: safe > 0 && rule.safeLabel ? `${rule.safeLabel} ${safe}건` : rule.clean,
  };
}

/** 언제 → 확인할 요일(0 = 일요일)과 시각 */
const SLOTS: Record<When, { days: number[]; hour: number; all: string; of: string }> = {
  WEEKDAY_LUNCH: { days: [1, 2, 3, 4, 5], hour: 12, all: '평일', of: '평일' },
  WEEKEND_LUNCH: { days: [6, 0], hour: 12, all: '토·일', of: '토·일' },
  DINNER: { days: [0, 1, 2, 3, 4, 5, 6], hour: 19, all: '매일', of: '일주일' },
  LATE_NIGHT: { days: [0, 1, 2, 3, 4, 5, 6], hour: 22, all: '매일', of: '일주일' },
};

/** 영업시간은 직접 입력한 가게만 있어서 모르면 부분, 그 시간에 하루도 안 열면 뺀다 */
function byHours(shop: ShopSignals, when: When): Judged {
  if (!shop.hours) return { status: 'PARTIAL', evidence: '영업시간 정보 없음' };
  const slot = SLOTS[when];
  const hours = shop.hours;
  const open = slot.days.filter((d) => isOpenAt(hours, d, slot.hour * 60)).length;
  if (open === 0)
    return { status: 'NONE', evidence: `${slot.of} ${slot.hour}시 휴무`, blocked: true };
  if (open === slot.days.length) {
    return { status: 'MATCH', evidence: `${slot.all} ${slot.hour}시 영업` };
  }
  return { status: 'PARTIAL', evidence: `${slot.of} 중 ${open}일만 ${slot.hour}시 영업` };
}

/** 가게 하나를 조건마다 판정 (conds와 같은 순서) */
export function judgeShop(shop: ShopSignals, conds: Condition[], area: AreaAverages): Judged[] {
  return conds.map((cond) => {
    switch (cond.kind) {
      case 'WHO':
        return byMentions(shop, WHO_RULES[cond.code as Who]);
      case 'WHEN':
        return byHours(shop, cond.code as When);
      case 'EXCLUDE':
        return byExclude(shop, EXCLUDE_RULES[cond.code as ExcludeCode]);
      case 'IMPORTANT': {
        const code = cond.code as Important;
        const mentions = () => byMentions(shop, IMPORTANT_RULES[code]);
        if (code === 'KIND') return byAverage(shop.service, '서비스', area.service, mentions);
        if (code === 'VALUE') return byAverage(shop.price, '가격 만족', area.price, mentions);
        return mentions();
      }
    }
  });
}

/** 결과 카드 태그 (중요해요 중 맞음) */
const TAGS: Record<Important, string> = {
  SPACIOUS: '좌석 넉넉',
  ROOM: '룸 좌석',
  PARKING: '주차 가능',
  QUIET: '조용함',
  KIND: '친절',
  SOLO_FRIENDLY: '혼밥 편함',
  VALUE: '가성비',
  FAST: '빨리 나옴',
};

/** "왜?" 한 줄 (맞음 근거 2개, 중요해요 먼저)과 태그 3개까지 */
export function summaryOf(conds: Condition[], judged: Judged[]) {
  const matched = conds
    .map((cond, i) => ({ cond, judged: judged[i] }))
    .filter((x) => x.judged.status === 'MATCH');
  const why = [
    ...matched.filter((x) => x.cond.kind === 'IMPORTANT'),
    ...matched.filter((x) => x.cond.kind !== 'IMPORTANT'),
  ]
    .slice(0, 2)
    .map((x) => x.judged.evidence);
  return {
    why: why.length > 0 ? why.join(' · ') : null,
    tags: matched
      .filter((x) => x.cond.kind === 'IMPORTANT')
      .slice(0, 3)
      .map((x) => TAGS[x.cond.code as Important]),
  };
}
