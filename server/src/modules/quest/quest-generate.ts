import type { Db, Tx } from '../../common/db';
import { distanceBetween } from '../../common/geo';
import { withCopula, withPastCopula, withSubjectParticle } from '../../common/josa';
import { findCurrentSeason } from '../../common/season';
import { addDays } from '../../common/time';
import { Prisma } from '../../generated/prisma/client';
import { nextTierOf, TIER_NAME, type TierCode } from '../ranking/tier';
import { detailStatsOf, myOverallOf, ratingOf } from '../restaurant/restaurant-stats';
import {
  TASTE_KEYS,
  type TasteKey,
  type TasteWeights,
  weightsOf,
  WEIGHT_SELECT,
} from '../user/taste-weights';
import {
  LEVEL_REWARD_REASON,
  placeWord,
  type QuestLevel,
  type QuestType,
  TASTE_LABEL,
  TYPE_LEVEL,
} from './quest-types';

// 퀘스트 고르기 (팀 공유 3장 "추천 고르는 순서"):
// 1. 후보 거르기 — 같은 구, 안 가 본 곳, 한 달 안에 추천한 곳 제외, 인증 리뷰 3개 이상(첫 평가자는 3개 미만)
// 2. 점수 매기기 — 내 종합 + 중요 항목 점수 + 익숙함/새로움 − 거리 (종류마다 비중이 다르다)
// 3. 이유 한 줄 — 점수에 가장 크게 기여한 기록으로 "왜 나에게 왔나요?"를 만든다 (AI 없이 서버 문장)

const DAY_MS = 24 * 60 * 60 * 1000;
/** 가던 곳만 가는 사람: 최근 한 달 방문 중 같은 가게 비율 */
const REGULAR_SHARE = 0.6;
/** 한 음식 종류만 먹는 사람 */
const ONE_CATEGORY_SHARE = 0.8;
/** 저장한 지 이만큼 지난 맛집 */
const SAVED_AFTER_DAYS = 14;
/** 티어 도전: 다음 티어까지 이 수 이하 */
const TIER_UP_MAX = 3;
/** 옆 동네 한 바퀴: 새로 정복할 곳 */
const NEXT_DONG_TARGET = 2;
const DEFAULT_REWARD: Record<QuestLevel, number> = { E: 50, X: 100, C: 150 };

export interface QuestProfile {
  userId: bigint;
  now: Date;
  weekStart: Date;
  home: {
    sigunguId: number;
    sigunguName: string;
    regionId: number;
    regionName: string;
    lat: number | null;
    lng: number | null;
  };
  weights: TasteWeights;
  personalized: boolean;
  /** 최근 한 달 성공한 방문 인증 */
  recent: {
    restaurantId: bigint;
    categoryId: number | null;
    categoryName: string | null;
    regionId: number;
  }[];
  /** 가 본 곳(방문 인증한 적 있는 곳) + 한 달 안에 추천한 곳 + 이번 주에 고른 곳 */
  excluded: Set<string>;
  /** 이번 주에 고른 동 (옆 동네 한 바퀴를 두 번 줄 때 겹치지 않게) */
  usedRegions: Set<number>;
  dislikes: Map<string, number>;
}

export interface QuestDraft {
  type: QuestType;
  restaurantId: bigint | null;
  regionId: number | null;
  target: number;
  title: string;
  summary: string;
  reasons: string[];
}

/** 퀘스트를 고르는 데 쓰는 내 기록. 내 동네가 없으면 null (추천은 같은 구 안에서만 한다) */
export async function loadProfile(db: Db, userId: bigint, weekStart: Date, now: Date) {
  const [member, local] = await Promise.all([
    db.member.findUniqueOrThrow({
      where: { id: userId },
      select: { ...WEIGHT_SELECT, personalizedReco: true },
    }),
    db.memberLocalRegion.findFirst({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
      select: {
        region: { select: { id: true, name: true, centerLat: true, centerLng: true } },
        sigungu: { select: { id: true, name: true } },
      },
    }),
  ]);
  if (!local) return null;
  const [recent, visited, recommended, dislikes] = await Promise.all([
    db.visit.findMany({
      where: {
        userId,
        status: { in: ['V', 'C'] },
        restaurantId: { not: null },
        verifiedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) },
      },
      select: {
        restaurantId: true,
        restaurant: {
          select: { categoryId: true, regionId: true, category: { select: { name: true } } },
        },
      },
    }),
    db.visit.findMany({
      where: { userId, restaurantId: { not: null } },
      distinct: ['restaurantId'],
      select: { restaurantId: true },
    }),
    db.quest.findMany({
      where: {
        userId,
        restaurantId: { not: null },
        regDate: { gte: new Date(now.getTime() - 30 * DAY_MS) },
      },
      select: { restaurantId: true },
    }),
    db.questDislike.findMany({ where: { userId }, select: { type: true, count: true } }),
  ]);
  return {
    userId,
    now,
    weekStart,
    home: {
      sigunguId: local.sigungu.id,
      sigunguName: local.sigungu.name,
      regionId: local.region.id,
      regionName: local.region.name,
      lat: local.region.centerLat?.toNumber() ?? null,
      lng: local.region.centerLng?.toNumber() ?? null,
    },
    weights: weightsOf(member),
    personalized: member.personalizedReco,
    recent: recent.flatMap((v) =>
      v.restaurantId && v.restaurant
        ? [
            {
              restaurantId: v.restaurantId,
              categoryId: v.restaurant.categoryId,
              categoryName: v.restaurant.category?.name ?? null,
              regionId: v.restaurant.regionId,
            },
          ]
        : [],
    ),
    excluded: new Set(
      [...visited, ...recommended].flatMap((r) =>
        r.restaurantId ? [r.restaurantId.toString()] : [],
      ),
    ),
    usedRegions: new Set<number>(),
    dislikes: new Map(dislikes.map((d) => [d.type, d.count])),
  } satisfies QuestProfile;
}

/** 같은 사람·같은 주·같은 자리면 같은 결과가 나오는 고르기 (후보 중 몇 번째) */
function seededIndex(p: QuestProfile, salt: number, size: number) {
  const seed =
    Number(p.userId % 100_003n) * 31 + Math.floor(p.weekStart.getTime() / DAY_MS) + salt * 17;
  return size > 0 ? seed % size : 0;
}

/** 가장 많이 나온 값과 그 수 */
function topOf<T>(values: T[], key: (v: T) => string | null) {
  const counts = new Map<string, { value: T; n: number }>();
  for (const v of values) {
    const k = key(v);
    if (k === null) continue;
    const c = counts.get(k);
    if (c) c.n += 1;
    else counts.set(k, { value: v, n: 1 });
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0] ?? null;
}

const CANDIDATE_SELECT = {
  id: true,
  name: true,
  categoryId: true,
  regionId: true,
  lat: true,
  lng: true,
  category: { select: { name: true } },
  region: { select: { name: true } },
  restaurantStat: true,
} satisfies Prisma.RestaurantSelect;

type CandidateRow = Prisma.RestaurantGetPayload<{ select: typeof CANDIDATE_SELECT }>;

function km(p: QuestProfile, r: CandidateRow) {
  if (p.home.lat === null || p.home.lng === null) return 0;
  return distanceBetween(p.home.lat, p.home.lng, r.lat.toNumber(), r.lng.toNumber()) / 1000;
}

/** 같은 구에서 인증 리뷰가 minReviews개 이상인 안 가 본 곳 (리뷰 많은 순 500곳까지) */
async function ratedCandidates(db: Db, p: QuestProfile, minReviews = 3) {
  const rows = await db.restaurant.findMany({
    where: {
      status: 'A',
      sigunguId: p.home.sigunguId,
      restaurantStat: { reviewCount: { gte: minReviews } },
    },
    select: CANDIDATE_SELECT,
    orderBy: { restaurantStat: { reviewCount: 'desc' } },
    take: 500,
  });
  return rows.filter((r) => !p.excluded.has(r.id.toString()));
}

/** 내 동 중심에서 가까운 안 가 본 곳 (maxReviews가 있으면 인증 리뷰가 그 수 이하인 곳만) */
async function nearbyCandidates(db: Db, p: QuestProfile, maxReviews: number | null, limit = 20) {
  const { lat, lng } = p.home;
  const reviewFilter =
    maxReviews === null
      ? Prisma.empty
      : Prisma.sql`AND COALESCE(s.review_count, 0) <= ${maxReviews}`;
  const order =
    lat === null || lng === null
      ? Prisma.sql`r.id`
      : Prisma.sql`ST_Distance_Sphere(POINT(r.lng, r.lat), POINT(${lng}, ${lat})), r.id`;
  const ids = await db.$queryRaw<{ id: bigint }[]>`
    SELECT r.id FROM restaurant r LEFT JOIN restaurant_stat s ON s.restaurant_id = r.id
    WHERE r.status = 'A' AND r.sigungu_id = ${p.home.sigunguId} ${reviewFilter}
    ORDER BY ${order}
    LIMIT ${limit + Math.min(p.excluded.size, 500)}`;
  const keep = ids.map((r) => BigInt(r.id)).filter((id) => !p.excluded.has(id.toString()));
  const rows = await db.restaurant.findMany({
    where: { id: { in: keep.slice(0, limit) } },
    select: CANDIDATE_SELECT,
  });
  return keep.slice(0, limit).flatMap((id) => rows.find((r) => r.id === id) ?? []);
}

function distanceText(p: QuestProfile, r: CandidateRow) {
  const m = Math.round(km(p, r) * 1000);
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}

const fmt = (n: number) => n.toFixed(1);

/** 중요하게 고른 항목 (보통보다 높고 가장 높은 것). 모두 같으면 null */
function importantKey(weights: TasteWeights): TasteKey | null {
  const max = Math.max(...TASTE_KEYS.map((k) => weights[k]));
  const min = Math.min(...TASTE_KEYS.map((k) => weights[k]));
  if (max === min) return null;
  // 맛 별점은 모두 크게 보여 주므로 같은 중요도면 맛 말고 다른 항목을 먼저
  return [...TASTE_KEYS].reverse().find((k) => weights[k] === max) ?? null;
}

function itemScore(r: CandidateRow, key: TasteKey) {
  return key === 'taste' ? ratingOf(r.restaurantStat).score : detailStatsOf(r.restaurantStat)[key];
}

const best = <T>(items: T[], score: (t: T) => number | null) =>
  items
    .map((t) => ({ t, s: score(t) }))
    .filter((x): x is { t: T; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s)[0]?.t ?? null;

type Builder = (db: Db, p: QuestProfile, salt: number) => Promise<QuestDraft | null>;

const restaurantDraft = (
  type: QuestType,
  r: CandidateRow,
  title: string,
  summary: string,
  reasons: (string | null)[],
): QuestDraft => ({
  type,
  restaurantId: r.id,
  regionId: null,
  target: 1,
  title,
  summary,
  reasons: reasons.filter((x): x is string => x !== null),
});

/** 탐험 · 새 맛 탐험: 최근 한 달 방문의 60% 이상이 같은 곳 → 안 가 본 같은 종류 중 내 종합이 높은 곳 */
const newTaste: Builder = async (db, p) => {
  if (!p.personalized || p.recent.length < 3) return null;
  const regular = topOf(p.recent, (v) => v.restaurantId.toString());
  if (!regular || regular.n / p.recent.length < REGULAR_SHARE) return null;
  const categoryId = regular.value.categoryId;
  const word = placeWord(regular.value.categoryName);
  const pool = (await ratedCandidates(db, p)).filter(
    (r) => categoryId === null || r.categoryId === categoryId,
  );
  const pick = best(pool, (r) => {
    const mo = myOverallOf(r.restaurantStat, p.weights).score;
    return mo === null ? null : mo - 0.2 * km(p, r);
  });
  if (!pick) return null;
  const mo = myOverallOf(pick.restaurantStat, p.weights).score;
  const pct = Math.round((regular.n / p.recent.length) * 100);
  return restaurantDraft(
    'NEW_TASTE',
    pick,
    `단골 ${word} 말고 새 ${word}`,
    `최근 한 달 방문의 ${pct}%가 같은 ${withCopula(word)}`,
    [
      `최근 한 달 방문 ${p.recent.length}번 중 ${regular.n}번이 같은 ${withPastCopula(word)}`,
      `자주 먹는 ${regular.value.categoryName ?? '음식'} 종류라 실패할 걱정이 적어요`,
      mo === null ? null : `내 취향으로 계산한 내 종합 별점이 ${fmt(mo)}점이에요`,
    ],
  );
};

/** 탐험 · 내 기준 맛집: 중요하게 고른 항목이 뚜렷함 → 그 항목 점수가 높은 곳 */
const myStandard: Builder = async (db, p) => {
  if (!p.personalized) return null;
  const key = importantKey(p.weights);
  if (!key) return null;
  const pool = await ratedCandidates(db, p);
  const scored = pool.filter((r) => itemScore(r, key) !== null);
  const pick = best(scored, (r) => {
    const mo = myOverallOf(r.restaurantStat, p.weights).score ?? 0;
    return (itemScore(r, key) ?? 0) + 0.3 * mo - 0.2 * km(p, r);
  });
  if (!pick) return null;
  const score = itemScore(pick, key) ?? 0;
  const avg = scored.reduce((s, r) => s + (itemScore(r, key) ?? 0), 0) / scored.length;
  const label = TASTE_LABEL[key];
  const mo = myOverallOf(pick.restaurantStat, p.weights).score;
  return restaurantDraft(
    'MY_STANDARD',
    pick,
    `${withSubjectParticle(label)} 좋은 ${placeWord(pick.category?.name)} 정복`,
    `중요하게 보는 ${withSubjectParticle(label)} ${fmt(score)}점이에요`,
    [
      `중요하게 보는 ${withSubjectParticle(label)} ${fmt(score)}점이에요 (${p.home.sigunguName} 평균 ${fmt(avg)})`,
      mo === null ? null : `내 취향으로 계산한 내 종합 별점이 ${fmt(mo)}점이에요`,
    ],
  );
};

/** 탐험 · 메뉴 넓히기: 한 음식 종류만 80% 이상 → 다른 종류 중 내 종합이 높은 곳 */
const widenMenu: Builder = async (db, p) => {
  if (!p.personalized || p.recent.length < 3) return null;
  const top = topOf(p.recent, (v) => (v.categoryId === null ? null : String(v.categoryId)));
  if (!top || top.n / p.recent.length < ONE_CATEGORY_SHARE) return null;
  const eaten = new Set(p.recent.map((v) => v.categoryId));
  const pool = (await ratedCandidates(db, p)).filter((r) => r.categoryId !== top.value.categoryId);
  const pick = best(pool, (r) => {
    const mo = myOverallOf(r.restaurantStat, p.weights).score;
    return mo === null ? null : mo + (eaten.has(r.categoryId) ? 0 : 0.5) - 0.2 * km(p, r);
  });
  if (!pick) return null;
  const topName = top.value.categoryName ?? '한 종류';
  const mo = myOverallOf(pick.restaurantStat, p.weights).score;
  const pct = Math.round((top.n / p.recent.length) * 100);
  return restaurantDraft(
    'WIDEN_MENU',
    pick,
    `${topName}만 말고 ${placeWord(pick.category?.name)} 어때요?`,
    `최근 한 달 방문의 ${pct}%가 ${withCopula(topName)}`,
    [
      `최근 한 달 방문의 ${pct}%가 ${withPastCopula(topName)}`,
      eaten.has(pick.categoryId)
        ? null
        : `${pick.category?.name ?? '이 종류'}는 최근에 안 가 봤어요`,
      mo === null ? null : `내 취향으로 계산한 내 종합 별점이 ${fmt(mo)}점이에요`,
    ],
  );
};

/** 탐험 · 동네 새 가게: 맞춤 추천을 껐거나 위 탐험 퀘스트를 고를 수 없을 때 — 가까운 안 가 본 곳 */
const localPick: Builder = async (db, p, salt) => {
  const pool = await nearbyCandidates(db, p, null, 10);
  const pick = pool[seededIndex(p, salt, pool.length)];
  if (!pick) return null;
  const rating = ratingOf(pick.restaurantStat);
  return restaurantDraft(
    'LOCAL_PICK',
    pick,
    `${pick.region?.name ?? '우리 동네'}의 새 가게 정복`,
    '아직 가 본 적 없는 동네 가게예요',
    [
      '아직 가 본 적 없는 동네 가게예요',
      `${p.home.regionName} 중심에서 ${distanceText(p, pick)} 거리예요`,
      rating.score === null
        ? null
        : `인증 리뷰 ${rating.reviewCount}개 · 맛 별점 ${fmt(rating.score)}점이에요`,
    ],
  );
};

/** 쉬움 · 첫 평가자: 인증 리뷰가 3개 미만인 가까운 곳 */
const firstReviewer: Builder = async (db, p, salt) => {
  const pool = await nearbyCandidates(db, p, 2, 15);
  const pick = pool[seededIndex(p, salt, pool.length)];
  if (!pick) return null;
  const reviews = pick.restaurantStat?.reviewCount ?? 0;
  const summary =
    reviews === 0 ? '아직 인증 리뷰가 없는 곳이에요' : `인증 리뷰가 ${reviews}개뿐인 곳이에요`;
  return restaurantDraft('FIRST_REVIEWER', pick, `${pick.name} 첫 평가자 되기`, summary, [
    summary,
    '아직 아무도 모르는 맛집, 첫 정복자가 되어 보세요',
    `${p.home.regionName} 중심에서 ${distanceText(p, pick)} 거리예요`,
  ]);
};

/** 쉬움 · 저장한 곳 가기: 저장한 지 14일 지난 아직 안 가 본 맛집 */
const savedVisit: Builder = async (db, p) => {
  const saved = await db.savedRestaurant.findMany({
    where: {
      userId: p.userId,
      regDate: { lte: new Date(p.now.getTime() - SAVED_AFTER_DAYS * DAY_MS) },
      restaurant: { status: 'A' },
    },
    orderBy: { regDate: 'asc' },
    select: { regDate: true, restaurant: { select: CANDIDATE_SELECT } },
  });
  const pick = saved.find((s) => !p.excluded.has(s.restaurant.id.toString()));
  if (!pick) return null;
  const days = Math.floor((p.now.getTime() - pick.regDate.getTime()) / DAY_MS);
  const ago = days >= 14 ? `${Math.floor(days / 7)}주 전` : `${days}일 전`;
  return restaurantDraft(
    'SAVED_VISIT',
    pick.restaurant,
    `${pick.restaurant.name} 정복`,
    `${ago}에 저장한 곳이에요`,
    [`${ago}에 저장한 곳이에요`, '저장만 하고 아직 가 보지 않았어요'],
  );
};

/** 도전 · 옆 동네 한 바퀴: 같은 구의 다른 동(내 동에서 가까운 순)에서 새로운 곳 2곳 */
const nextDong: Builder = async (db, p) => {
  const dongs = await db.region.findMany({
    where: { level: 3, parentId: p.home.sigunguId, id: { not: p.home.regionId } },
    select: { id: true, name: true, centerLat: true, centerLng: true },
  });
  const { lat, lng } = p.home;
  const sorted = dongs
    .filter((d) => !p.usedRegions.has(d.id))
    .map((d) => ({
      d,
      dist:
        lat === null || lng === null || !d.centerLat || !d.centerLng
          ? 0
          : distanceBetween(lat, lng, d.centerLat.toNumber(), d.centerLng.toNumber()),
    }))
    .sort((a, b) => a.dist - b.dist);
  const visitedDongs = new Set(p.recent.map((v) => v.regionId));
  for (const { d } of sorted) {
    if (visitedDongs.has(d.id)) continue;
    const count = await db.restaurant.count({ where: { regionId: d.id, status: 'A' } });
    if (count < NEXT_DONG_TARGET) continue;
    const onlyHome = p.recent.length > 0 && p.recent.every((v) => v.regionId === p.home.regionId);
    return {
      type: 'NEXT_DONG',
      restaurantId: null,
      regionId: d.id,
      target: NEXT_DONG_TARGET,
      title: `${d.name}에서 새로운 곳 ${NEXT_DONG_TARGET}곳`,
      summary: `${d.name}에 정복할 곳이 ${count.toLocaleString('ko-KR')}곳 있어요`,
      reasons: [
        onlyHome
          ? `최근 한 달은 ${p.home.regionName}에서만 정복했어요`
          : `${p.home.regionName} 바로 옆 동네예요`,
        `${d.name}에 정복할 곳이 ${count.toLocaleString('ko-KR')}곳 있어요`,
        '이 동에서 처음 가 보는 가게를 정복하면 진행돼요',
      ],
    };
  }
  return null;
};

/** 도전 · 티어 도전: 다음 티어까지 3곳 이하 → 내 동네 구에서 새로 정복 */
const tierUp: Builder = async (db, p) => {
  const season = await findCurrentSeason(db);
  if (!season) return null;
  const stat = await db.seasonRegionStat.findUnique({
    where: {
      seasonId_sigunguId_userId: {
        seasonId: season.id,
        sigunguId: p.home.sigunguId,
        userId: p.userId,
      },
    },
    select: { tier: true, conquestCount: true },
  });
  const next = nextTierOf((stat?.tier ?? 'B') as TierCode, stat?.conquestCount ?? 0);
  if (!next?.remaining || next.remaining > TIER_UP_MAX) return null;
  const tierName = `${p.home.sigunguName} ${TIER_NAME[next.tier]}`;
  return {
    type: 'TIER_UP',
    restaurantId: null,
    regionId: null,
    target: next.remaining,
    title: `${next.remaining}곳 더 정복하고 ${tierName} 되기`,
    summary: `${next.remaining}곳만 더 정복하면 ${withSubjectParticle(tierName)} 돼요`,
    reasons: [
      `${next.remaining}곳만 더 정복하면 ${withSubjectParticle(tierName)} 돼요`,
      `이번 시즌 ${p.home.sigunguName}에서 새로 정복한 곳이 모두 세져요`,
    ],
  };
};

const BUILDERS: Record<QuestType, Builder> = {
  NEW_TASTE: newTaste,
  MY_STANDARD: myStandard,
  WIDEN_MENU: widenMenu,
  LOCAL_PICK: localPick,
  NEXT_DONG: nextDong,
  TIER_UP: tierUp,
  FIRST_REVIEWER: firstReviewer,
  SAVED_VISIT: savedVisit,
};

/** 난이도마다 시도할 종류 순서. 탐험은 "관심 없어요"를 덜 누른 종류부터 */
function typeOrder(level: QuestLevel, p: QuestProfile): QuestType[] {
  if (level === 'E') return ['SAVED_VISIT', 'FIRST_REVIEWER'];
  if (level === 'C') return ['TIER_UP', 'NEXT_DONG'];
  const explore: QuestType[] = ['NEW_TASTE', 'MY_STANDARD', 'WIDEN_MENU'];
  const ordered = explore
    .map((t, i) => ({ t, i, n: p.dislikes.get(t) ?? 0 }))
    .sort((a, b) => a.n - b.n || a.i - b.i)
    .map((x) => x.t);
  return [...(p.personalized ? ordered : []), 'LOCAL_PICK'];
}

/**
 * 난이도에 맞는 퀘스트 하나 (못 고르면 null). skipTypes의 종류는 건너뛴다 (관심 없어요·이번 주에 이미 준 종류).
 * 탐험 후보가 없으면(리뷰가 쌓이기 전) 동네 새 가게로, 그것도 없으면 첫 평가자로 대신한다
 */
export async function draftQuest(
  db: Db,
  p: QuestProfile,
  level: QuestLevel,
  salt: number,
  skipTypes: Set<QuestType> = new Set(),
): Promise<{ level: QuestLevel; draft: QuestDraft } | null> {
  for (const type of typeOrder(level, p)) {
    if (skipTypes.has(type)) continue;
    const draft = await BUILDERS[type](db, p, salt);
    if (draft) return { level: TYPE_LEVEL[type], draft };
  }
  if (level !== 'E' && !skipTypes.has('FIRST_REVIEWER')) {
    const draft = await firstReviewer(db, p, salt);
    if (draft) return { level: 'E', draft };
  }
  return null;
}

/** 퀘스트 행을 만들고 고른 가게·동을 이번 주 제외 목록에 넣는다 */
export async function insertQuest(
  tx: Tx,
  p: QuestProfile,
  weekId: bigint,
  picked: { level: QuestLevel; draft: QuestDraft },
  isBonus = false,
) {
  const policy = await tx.rewardPolicy.findUnique({
    where: { reason: LEVEL_REWARD_REASON[picked.level] },
    select: { point: true },
  });
  const { draft } = picked;
  if (draft.restaurantId) p.excluded.add(draft.restaurantId.toString());
  if (draft.regionId) p.usedRegions.add(draft.regionId);
  return tx.quest.create({
    data: {
      weekId,
      userId: p.userId,
      type: draft.type,
      level: picked.level,
      restaurantId: draft.restaurantId,
      regionId: draft.regionId,
      target: draft.target,
      title: draft.title.slice(0, 60),
      summary: draft.summary.slice(0, 100),
      reasons: draft.reasons,
      rewardPoint: policy?.point ?? DEFAULT_REWARD[picked.level],
      isBonus,
      regDate: p.now,
    },
  });
}

/** 지난 4주(이번 주 월요일 전 28일) 성공한 방문 인증 수 */
export function visitsIn4Weeks(db: Db, userId: bigint, weekStart: Date) {
  const start = addDays(weekStart, -28);
  return db.visit.count({
    where: {
      userId,
      status: { in: ['V', 'C'] },
      verifiedAt: {
        gte: new Date(start.getTime() - 9 * 60 * 60 * 1000),
        lt: new Date(weekStart.getTime() - 9 * 60 * 60 * 1000),
      },
    },
  });
}
