import { api, request } from '../lib/api';
import type { RestaurantCardItem } from './restaurants';

// 상황 직접 입력 추천 (피그마 3, 3-4)

export type Who = 'SOLO' | 'FRIEND' | 'COUPLE' | 'FAMILY' | 'KIDS' | 'GROUP';
export type When = 'WEEKDAY_LUNCH' | 'WEEKEND_LUNCH' | 'DINNER' | 'LATE_NIGHT';
export type ExcludeCode = 'SPICY' | 'RAW' | 'BAR' | 'LONG_WAIT';
export type Important =
  'SPACIOUS' | 'ROOM' | 'PARKING' | 'QUIET' | 'KIND' | 'SOLO_FRIENDLY' | 'VALUE' | 'FAST';

export type Conditions = {
  who: Who | null;
  when: When | null;
  exclude: ExcludeCode[];
  important: Important[];
};

export type ConditionKind = 'WHO' | 'WHEN' | 'EXCLUDE' | 'IMPORTANT';
export type FitStatus = 'MATCH' | 'PARTIAL' | 'NONE';

export type SituationParse = {
  /** 조건을 하나도 못 찾으면 false (⑤) */
  found: boolean;
  conditions: Conditions;
  title: string | null;
  /** AI면 "AI 분석" 표시 */
  source: 'AI' | 'RULE';
};

export type FitReason = {
  kind: ConditionKind;
  condition: string;
  /** "가족 · 부모님", "매운 음식 빼기" */
  label: string;
  status: FitStatus;
  /** 서버 계산 근거. 예) 가족 동행 리뷰 9건 */
  evidence: string;
};

export type SituationItem = RestaurantCardItem & {
  /** 상황 적합도 0~100 */
  fitScore: number;
  /** "왜?" 한 줄 (없으면 null) */
  why: string | null;
  tags: string[];
  /** 조건 전체 (④ 시트·⑦ 상세) */
  reasons: FitReason[];
};

export type SituationSuggestion = {
  type: 'REMOVE' | 'WIDEN';
  kind: ConditionKind | null;
  condition: string | null;
  /** WIDEN: 넓힐 구 id */
  regionId: number | null;
  label: string;
  count: number;
};

export type SituationResult = {
  title: string;
  conditions: Conditions;
  region: {
    regionId: number;
    level: number;
    dongName: string | null;
    sigunguId: number;
    sigunguName: string;
  };
  items: SituationItem[];
  /** 결과가 없을 때만 (⑥) */
  suggestions: SituationSuggestion[];
};

/** 상황 문장 → 조건. 취소하면 signal로 끊는다 */
export const parseSituation = async (text: string, signal?: AbortSignal) =>
  (
    await request<SituationParse>('POST', '/recommendations/situation/parse', {
      body: { text },
      signal,
    })
  ).data;

export const getSituationRecommendations = (body: {
  regionId: number;
  conditions: Conditions;
  lat?: number;
  lng?: number;
}) => api.post<SituationResult>('/recommendations/situation', body);
