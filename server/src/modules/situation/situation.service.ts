import { findCurrentSeason } from '../../common/season';
import { prisma } from '../../lib/prisma';
import { requireSeoulArea } from '../region/region.service';
import { parseBusinessHours } from '../restaurant/business-hours';
import { loadMyStates, myStateOf } from '../restaurant/my-state';
import { loadRestaurantsInOrder, toRestaurantCard } from '../restaurant/restaurant-card';
import { regionIdOrMyFirst } from '../search/search.service';
import { loadTasteWeights } from '../user/taste-weights';
import { type Conditions, titleOf } from './situation-conditions';
import {
  type AreaAverages,
  type Condition,
  conditionList,
  fitOf,
  type Judged,
  judgeShop,
  type ShopSignals,
  summaryOf,
} from './situation-rules';

/** 후보: 인증 리뷰 5개 이상 (RECO-01 RATING과 같은 기준) */
const MIN_REVIEWS = 5;
/** 상황 적합도가 이만큼 넘는 가게만 보여 준다 */
const MIN_FIT = 50;
const MAX_ITEMS = 20;
/** ⑥ "하나만 빼면" 제안 수 */
const MAX_REMOVE_SUGGESTIONS = 2;

type Area = { regionId: number } | { sigunguId: number };

interface Scored {
  id: bigint;
  score: number;
  reviewCount: number;
  judged: Judged[];
}

/** 동네(또는 구) 후보 가게를 읽어 조건마다 판정한다 */
async function judgeArea(area: Area, conds: Condition[]): Promise<Scored[]> {
  const shops = await prisma.restaurant.findMany({
    where: { status: 'A', ...area, restaurantStat: { reviewCount: { gte: MIN_REVIEWS } } },
    select: {
      id: true,
      name: true,
      categoryDetail: true,
      businessHours: true,
      category: { select: { name: true } },
      restaurantStat: {
        select: {
          displayScore: true,
          reviewCount: true,
          serviceSum: true,
          priceSum: true,
          detailReviewCount: true,
        },
      },
    },
  });
  if (shops.length === 0) return [];
  const reviews = await prisma.review.findMany({
    where: { restaurantId: { in: shops.map((s) => s.id) }, status: 'A' },
    select: {
      restaurantId: true,
      content: true,
      aspectMarks: { select: { polarity: true, aspect: { select: { code: true } } } },
    },
  });
  // 인증 영수증 메뉴 (먹고 싶어요·날씨 판정). 같은 메뉴가 여러 번 나오면 그만큼 센다
  const receiptItems = await prisma.visitReceiptItem.findMany({
    where: { visit: { restaurantId: { in: shops.map((s) => s.id) }, status: 'C' } },
    select: { menuName: true, visit: { select: { restaurantId: true } } },
  });
  const menusOf = new Map<string, string[]>();
  for (const item of receiptItems) {
    const key = item.visit.restaurantId?.toString();
    if (!key) continue;
    menusOf.set(key, [...(menusOf.get(key) ?? []), item.menuName]);
  }

  const reviewsOf = new Map<string, ShopSignals['reviews']>();
  for (const r of reviews) {
    const key = r.restaurantId.toString();
    const list = reviewsOf.get(key) ?? [];
    list.push({
      text: r.content ?? '',
      marks: new Map(r.aspectMarks.map((m) => [m.aspect.code, m.polarity])),
    });
    reviewsOf.set(key, list);
  }

  const detail = (sum: number, count: number) => (count > 0 ? { avg: sum / count, count } : null);
  const areaAvg = (pick: 'serviceSum' | 'priceSum'): number | null => {
    let sum = 0;
    let count = 0;
    for (const s of shops) {
      sum += s.restaurantStat?.[pick] ?? 0;
      count += s.restaurantStat?.detailReviewCount ?? 0;
    }
    return count > 0 ? sum / count : null;
  };
  const averages: AreaAverages = { service: areaAvg('serviceSum'), price: areaAvg('priceSum') };

  return shops.map((s) => {
    const stat = s.restaurantStat;
    const signals: ShopSignals = {
      text: [s.name, s.categoryDetail, s.category?.name].filter(Boolean).join(' '),
      hours: parseBusinessHours(s.businessHours),
      service: stat ? detail(stat.serviceSum, stat.detailReviewCount) : null,
      price: stat ? detail(stat.priceSum, stat.detailReviewCount) : null,
      reviews: reviewsOf.get(s.id.toString()) ?? [],
      menus: menusOf.get(s.id.toString()) ?? [],
    };
    return {
      id: s.id,
      score: stat?.displayScore?.toNumber() ?? 0,
      reviewCount: stat?.reviewCount ?? 0,
      judged: judgeShop(signals, conds, averages),
    };
  });
}

/** ⑥ "하나만 빼면" 문구. 예) 주차 빼기, 매운 음식도 보기, 국물 말고도 보기 */
function suggestionLabel(cond: Condition) {
  if (cond.kind === 'EXCLUDE') return `${cond.label.replace(/ 빼기$/, '')}도 보기`;
  if (cond.kind === 'CRAVING') return `${cond.label} 말고도 보기`;
  return `${cond.label} 빼기`;
}

const countFits = (scored: Scored[], conds: Condition[], skip = -1) =>
  scored.filter((s) => (fitOf(conds, s.judged, skip) ?? 0) >= MIN_FIT).length;

/**
 * 상황 맞춤 결과 (피그마 3 상황 맞춤 결과, 3-4 ④⑥).
 * 상황 적합도 순, 같으면 신뢰 별점 순. 신뢰 별점 숫자는 바꾸지 않는다.
 * 결과가 없으면 조건을 하나씩 뺐을 때 가게 수가 많은 2개 + 동네 넓히기를 제안한다.
 */
export async function getSituationRecommendations(
  userId: bigint,
  input: { regionId?: number; conditions: Conditions; lat?: number; lng?: number },
) {
  const area = await requireSeoulArea(
    await regionIdOrMyFirst(userId, input.regionId),
    '지금은 서울만 볼 수 있어요.',
  );
  const conds = conditionList(input.conditions);
  const scored = await judgeArea(
    area.level === 3 ? { regionId: area.dong.id } : { sigunguId: area.sigungu.id },
    conds,
  );

  const ranked = scored
    .map((s) => ({ ...s, fit: fitOf(conds, s.judged) }))
    .filter((s): s is typeof s & { fit: number } => s.fit !== null && s.fit >= MIN_FIT)
    .sort(
      (a, b) =>
        b.fit - a.fit ||
        b.score - a.score ||
        b.reviewCount - a.reviewCount ||
        (a.id < b.id ? -1 : 1),
    )
    .slice(0, MAX_ITEMS);

  const ids = ranked.map((s) => s.id);
  const [rows, states, weights] = await Promise.all([
    loadRestaurantsInOrder(ids),
    loadMyStates(userId, ids, await findCurrentSeason()),
    loadTasteWeights(userId),
  ]);
  const byId = new Map(ranked.map((s) => [s.id.toString(), s]));
  const items = rows.map((row) => {
    const s = byId.get(row.id.toString())!;
    return {
      ...toRestaurantCard(row, myStateOf(states, row.id), input, weights),
      fitScore: s.fit,
      ...summaryOf(conds, s.judged),
      /** ④ 시트·⑦ 상세 이유 카드: 조건 전체 */
      reasons: conds.map((cond, i) => ({
        kind: cond.kind,
        condition: cond.code,
        label: cond.label,
        status: s.judged[i].status,
        evidence: s.judged[i].evidence,
      })),
    };
  });

  const suggestions: {
    type: 'REMOVE' | 'WIDEN';
    kind: Condition['kind'] | null;
    condition: string | null;
    regionId: number | null;
    label: string;
    count: number;
  }[] = [];
  if (items.length === 0) {
    if (conds.length > 1) {
      suggestions.push(
        ...conds
          .map((cond, i) => ({
            type: 'REMOVE' as const,
            kind: cond.kind,
            condition: cond.code,
            regionId: null,
            label: suggestionLabel(cond),
            count: countFits(scored, conds, i),
          }))
          .filter((s) => s.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, MAX_REMOVE_SUGGESTIONS),
      );
    }
    if (area.level === 3) {
      const count = countFits(await judgeArea({ sigunguId: area.sigungu.id }, conds), conds);
      if (count > 0) {
        suggestions.push({
          type: 'WIDEN',
          kind: null,
          condition: null,
          regionId: area.sigungu.id,
          label: `동네 넓히기 · ${area.sigungu.name} 전체`,
          count,
        });
      }
    }
  }

  return {
    title: titleOf(input.conditions),
    conditions: input.conditions,
    region: {
      regionId: area.level === 3 ? area.dong.id : area.sigungu.id,
      level: area.level,
      dongName: area.dong?.name ?? null,
      sigunguId: area.sigungu.id,
      sigunguName: area.sigungu.name,
    },
    items,
    suggestions,
  };
}
