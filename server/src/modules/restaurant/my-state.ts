import type { CurrentSeason } from '../../common/season';
import { prisma } from '../../lib/prisma';

/** 명세서 "주요 코드값 3": 이번 시즌 정복 완료 / 방문 인증 후 별점 대기(먹깨비 이동 중) / 미정복 */
export type ConquestState = 'CONQUERED' | 'MOVING' | 'NOT_CONQUERED';

export interface MyRestaurantState {
  conquestState: ConquestState;
  /** 지난 시즌(진행 중 시즌이 아닌 시즌)에 정복한 적이 있는지 */
  conqueredInPastSeason: boolean;
  isSaved: boolean;
  /** 이번 시즌 정복 (conquestState와 상관없이 있으면 채운다) */
  currentConquest: { visitId: bigint; conqueredAt: Date } | null;
  /** 별점 대기 중인 방문 (visit.status = V, 가장 최근 것) */
  movingVisit: { id: bigint; verifiedAt: Date | null } | null;
}

const EMPTY: MyRestaurantState = {
  conquestState: 'NOT_CONQUERED',
  conqueredInPastSeason: false,
  isSaved: false,
  currentConquest: null,
  movingVisit: null,
};

/**
 * 가게마다 내 정복 상태 (MAP-01·02, REST-01, SEARCH-02, RECO-01 공통 기준).
 * - 내 방문 중 status = V(인증 완료·별점 대기)가 있으면 MOVING (먹깨비가 그 가게로 가는 중이라 정복 완료보다 먼저 본다)
 * - 이번 시즌(season.status = A) conquest 행이 있으면 CONQUERED
 * - 그 밖에는 NOT_CONQUERED
 * 결과 Map의 키는 restaurant id 문자열.
 */
export async function loadMyStates(
  userId: bigint,
  restaurantIds: bigint[],
  season: CurrentSeason | null,
): Promise<Map<string, MyRestaurantState>> {
  const states = new Map<string, MyRestaurantState>();
  if (restaurantIds.length === 0) return states;
  const where = { userId, restaurantId: { in: restaurantIds } };

  const [conquests, movingVisits, saved] = await Promise.all([
    prisma.conquest.findMany({
      where,
      select: { restaurantId: true, seasonId: true, visitId: true, conqueredAt: true },
    }),
    prisma.visit.findMany({
      where: { ...where, status: 'V' },
      orderBy: [{ verifiedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, restaurantId: true, verifiedAt: true },
    }),
    prisma.savedRestaurant.findMany({ where, select: { restaurantId: true } }),
  ]);

  const stateOf = (id: bigint) => {
    const key = id.toString();
    let state = states.get(key);
    if (!state) {
      state = { ...EMPTY };
      states.set(key, state);
    }
    return state;
  };

  for (const c of conquests) {
    const state = stateOf(c.restaurantId);
    if (season && c.seasonId === season.id) {
      state.currentConquest = { visitId: c.visitId, conqueredAt: c.conqueredAt };
    } else {
      state.conqueredInPastSeason = true;
    }
  }
  for (const v of movingVisits) {
    if (v.restaurantId === null) continue;
    const state = stateOf(v.restaurantId);
    state.movingVisit ??= { id: v.id, verifiedAt: v.verifiedAt };
  }
  for (const s of saved) stateOf(s.restaurantId).isSaved = true;

  for (const state of states.values()) {
    state.conquestState = state.movingVisit
      ? 'MOVING'
      : state.currentConquest
        ? 'CONQUERED'
        : 'NOT_CONQUERED';
  }
  return states;
}

/** loadMyStates 결과에서 한 가게 (기록이 없으면 미정복) */
export function myStateOf(states: Map<string, MyRestaurantState>, restaurantId: bigint) {
  return states.get(restaurantId.toString()) ?? EMPTY;
}
