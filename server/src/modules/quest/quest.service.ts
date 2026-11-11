import type { Db } from '../../common/db';
import { AppError } from '../../common/errors/app-error';
import { distanceBetween } from '../../common/geo';
import { findCurrentSeason } from '../../common/season';
import {
  addDays,
  formatDbDate,
  kstTodayAsDbDate,
  kstWeekStartAsDbDate,
  toKstIsoOrNull,
} from '../../common/time';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { questStreak } from '../achievement/achievement.service';
import { coverImageUrlOf, myOverallOf, ratingOf } from '../restaurant/restaurant-stats';
import { type TasteWeights, weightsOf, WEIGHT_SELECT } from '../user/taste-weights';
import {
  draftQuest,
  insertQuest,
  loadProfile,
  type QuestProfile,
  visitsIn4Weeks,
} from './quest-generate';
import {
  ACTIVITY_API,
  ACTIVITY_NAME,
  LEVEL_API,
  LEVEL_NAME,
  type QuestLevel,
  type QuestType,
  TYPE_NAME,
  weekPlan,
} from './quest-types';
import { QuestError } from './quest.errors';

const DAY_MS = 24 * 60 * 60 * 1000;
/** 퀘스트 기록 화면의 업적 (꾸준한 탐험가 = 4주 연속, 새 맛 수집가 = 퀘스트로 10곳) */
const STREAK_ACHIEVEMENT = 'QUEST_STREAK_4';
const PLACES_ACHIEVEMENT = 'QUEST_PLACES_10';

/** 이번 주 퀘스트 행이 없으면 만든다. 내 동네가 없으면 null (추천은 같은 구 안에서만) */
export async function ensureWeek(userId: bigint, now = new Date()) {
  const weekStart = kstWeekStartAsDbDate(now);
  const key = { userId_weekStart: { userId, weekStart } };
  const existing = await prisma.questWeek.findUnique({ where: key });
  if (existing) return existing;
  const profile = await loadProfile(prisma, userId, weekStart, now);
  if (!profile) return null;
  const plan = weekPlan(await visitsIn4Weeks(prisma, userId, weekStart));

  // 고르기는 읽기만 하므로 트랜잭션 밖에서. 같은 종류(탐험 3종·티어·저장한 곳)는 한 주에 한 번만
  const picks: NonNullable<Awaited<ReturnType<typeof draftQuest>>>[] = [];
  const used = new Set<QuestType>();
  for (const [slot, level] of plan.levels.entries()) {
    const picked = await draftQuest(prisma, profile, level, slot, used);
    if (!picked) continue;
    if (!['NEXT_DONG', 'FIRST_REVIEWER', 'LOCAL_PICK'].includes(picked.draft.type)) {
      used.add(picked.draft.type);
    }
    if (picked.draft.restaurantId) profile.excluded.add(picked.draft.restaurantId.toString());
    if (picked.draft.regionId) profile.usedRegions.add(picked.draft.regionId);
    picks.push(picked);
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const week = await tx.questWeek.create({
        data: { userId, weekStart, baseCount: picks.length, activity: plan.activity, regDate: now },
      });
      for (const picked of picks) await insertQuest(tx, profile, week.id, picked);
      return week;
    });
  } catch (err) {
    // 같은 주 퀘스트를 동시에 두 번 만들려고 하면 한쪽만 남는다
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return prisma.questWeek.findUniqueOrThrow({ where: key });
    }
    throw err;
  }
}

const QUEST_INCLUDE = {
  restaurant: {
    select: {
      id: true,
      name: true,
      lat: true,
      lng: true,
      category: { select: { name: true } },
      region: { select: { name: true } },
      restaurantStat: true,
    },
  },
  region: { select: { id: true, name: true } },
} satisfies Prisma.QuestInclude;

type QuestRow = Prisma.QuestGetPayload<{ include: typeof QUEST_INCLUDE }>;

interface ViewContext {
  home: { lat: number | null; lng: number | null } | null;
  weights: TasteWeights;
  conquered: Set<string>;
}

async function viewContext(db: Db, userId: bigint, quests: { restaurantId: bigint | null }[]) {
  const [member, local, season] = await Promise.all([
    db.member.findUniqueOrThrow({ where: { id: userId }, select: WEIGHT_SELECT }),
    db.memberLocalRegion.findFirst({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
      select: { region: { select: { centerLat: true, centerLng: true } } },
    }),
    findCurrentSeason(db),
  ]);
  const ids = quests.flatMap((q) => (q.restaurantId ? [q.restaurantId] : []));
  const conquests =
    season && ids.length > 0
      ? await db.conquest.findMany({
          where: { userId, seasonId: season.id, restaurantId: { in: ids } },
          select: { restaurantId: true },
        })
      : [];
  return {
    home: local
      ? {
          lat: local.region.centerLat?.toNumber() ?? null,
          lng: local.region.centerLng?.toNumber() ?? null,
        }
      : null,
    weights: weightsOf(member),
    conquered: new Set(conquests.map((c) => c.restaurantId.toString())),
  } satisfies ViewContext;
}

function questView(q: QuestRow, ctx: ViewContext) {
  const r = q.restaurant;
  const home = ctx.home;
  return {
    questId: q.id,
    type: q.type,
    typeName: TYPE_NAME[q.type as QuestType] ?? q.type,
    level: LEVEL_API[q.level as QuestLevel],
    levelName: LEVEL_NAME[q.level as QuestLevel],
    title: q.title,
    summary: q.summary,
    reasons: Array.isArray(q.reasons) ? (q.reasons as string[]) : [],
    target: q.target,
    progress: q.progress,
    rewardPoint: q.rewardPoint,
    isBonus: q.isBonus,
    status: q.status === 'C' ? ('DONE' as const) : ('ACTIVE' as const),
    completedAt: toKstIsoOrNull(q.completedAt),
    restaurant: r
      ? {
          restaurantId: r.id,
          name: r.name,
          categoryName: r.category?.name ?? null,
          imageUrl: coverImageUrlOf(r.restaurantStat),
          regionName: r.region?.name ?? null,
          /** 내 동네(첫 번째) 동 중심에서 거리 (m) */
          distanceM:
            home?.lat != null && home.lng != null
              ? Math.round(distanceBetween(home.lat, home.lng, r.lat.toNumber(), r.lng.toNumber()))
              : null,
          tasteScore: ratingOf(r.restaurantStat).score,
          myOverallScore: myOverallOf(r.restaurantStat, ctx.weights).score,
          /** 이번 시즌에 이미 정복했는지 */
          isConquered: ctx.conquered.has(r.id.toString()),
        }
      : null,
    region: q.region ? { regionId: q.region.id, name: q.region.name } : null,
  };
}

/** 주 요약: 남은 날(D-n, 일요일이 0), 기본 퀘스트 진행, 바꾸기 가능 여부, 주간 상자 */
function weekView(
  week: {
    id: bigint;
    weekStart: Date;
    activity: string;
    swappedAt: Date | null;
    completedAt: Date | null;
  },
  quests: { isBonus: boolean; status: string }[],
  now: Date,
) {
  const base = quests.filter((q) => !q.isBonus);
  const today = kstTodayAsDbDate(now);
  const current = kstWeekStartAsDbDate(now).getTime() === week.weekStart.getTime();
  return {
    weekId: week.id,
    startDate: formatDbDate(week.weekStart),
    endDate: formatDbDate(addDays(week.weekStart, 6)),
    isCurrent: current,
    daysLeft: current ? 6 - Math.round((today.getTime() - week.weekStart.getTime()) / DAY_MS) : 0,
    activity: ACTIVITY_API[week.activity as 'L' | 'M' | 'H'],
    activityName: ACTIVITY_NAME[week.activity as 'L' | 'M' | 'H'],
    baseCount: base.length,
    doneCount: base.filter((q) => q.status === 'C').length,
    bonusDoneCount: quests.filter((q) => q.isBonus && q.status === 'C').length,
    swapAvailable: current && week.swappedAt === null,
    /** 기본 퀘스트를 모두 깨서 주간 아이템 상자를 받았는지 */
    boxReceived: week.completedAt !== null,
  };
}

async function weekQuests(db: Db, weekId: bigint) {
  return db.quest.findMany({
    where: { weekId, status: { in: ['A', 'C'] } },
    include: QUEST_INCLUDE,
    orderBy: [{ isBonus: 'asc' }, { id: 'asc' }],
  });
}

/** QUEST-01 이번 주 퀘스트 (처음 열면 이번 주 퀘스트를 만든다) */
export async function getCurrentQuests(userId: bigint, now = new Date()) {
  const member = await prisma.member.findUniqueOrThrow({
    where: { id: userId },
    select: { questEnabled: true },
  });
  if (!member.questEnabled) return { enabled: false, week: null, quests: [], streak: 0 };
  const week = await ensureWeek(userId, now);
  if (!week) return { enabled: true, week: null, quests: [], streak: 0 };
  const quests = await weekQuests(prisma, week.id);
  const ctx = await viewContext(prisma, userId, quests);
  return {
    enabled: true,
    week: weekView(week, quests, now),
    quests: quests.map((q) => questView(q, ctx)),
    streak: await questStreak(prisma, userId, now),
  };
}

async function findOwnQuest(db: Db, userId: bigint, questId: bigint) {
  const quest = await db.quest.findUnique({
    where: { id: questId },
    include: { ...QUEST_INCLUDE, week: true },
  });
  if (!quest || quest.userId !== userId) throw new AppError(QuestError.QUEST_NOT_FOUND);
  return quest;
}

/** QUEST-02 퀘스트 상세 ("왜 나에게 왔나요?", 바꾸기·관심 없어요) */
export async function getQuestDetail(userId: bigint, questId: bigint, now = new Date()) {
  const quest = await findOwnQuest(prisma, userId, questId);
  const quests = await prisma.quest.findMany({
    where: { weekId: quest.weekId, status: { in: ['A', 'C'] } },
    select: { isBonus: true, status: true },
  });
  const ctx = await viewContext(prisma, userId, [quest]);
  const week = weekView(quest.week, quests, now);
  return {
    ...questView(quest, ctx),
    week,
    /** 이 퀘스트를 깨면 주간 상자까지 남는 수 (보너스 퀘스트·이미 받은 주는 null) */
    boxRemaining:
      quest.isBonus || week.boxReceived
        ? null
        : week.baseCount - week.doneCount - (quest.status === 'C' ? 0 : 1),
    canChange: week.isCurrent && quest.status === 'A' && quest.progress === 0,
  };
}

/** 바꾸기·관심 없어요: 같은 난이도의 다른 퀘스트로 바꾼다 (이번 주 진행 중이고 아직 시작 안 한 퀘스트만) */
async function replaceQuest(userId: bigint, questId: bigint, mode: 'SWAP' | 'DISMISS', now: Date) {
  return prisma.$transaction(
    async (tx) => {
      const quest = await findOwnQuest(tx, userId, questId);
      const [week] = await tx.$queryRaw<{ swapped_at: Date | null; week_start: Date }[]>`
        SELECT swapped_at, week_start FROM quest_week WHERE id = ${quest.weekId} FOR UPDATE`;
      const current = kstWeekStartAsDbDate(now).getTime() === week.week_start.getTime();
      const fresh = await tx.quest.findUniqueOrThrow({ where: { id: questId } });
      if (!current || fresh.status !== 'A') throw new AppError(QuestError.QUEST_NOT_ACTIVE);
      if (fresh.progress > 0) throw new AppError(QuestError.QUEST_IN_PROGRESS);
      if (mode === 'SWAP' && week.swapped_at !== null)
        throw new AppError(QuestError.QUEST_SWAP_USED);

      const profile: QuestProfile | null = await loadProfile(tx, userId, week.week_start, now);
      if (!profile) throw new AppError(QuestError.QUEST_NO_REPLACEMENT);
      const others = await tx.quest.findMany({
        where: { weekId: quest.weekId, status: { in: ['A', 'C'] } },
        select: { type: true, regionId: true },
      });
      for (const o of others) if (o.regionId) profile.usedRegions.add(o.regionId);
      // 관심 없어요: 그 종류를 덜 추천하고, 이번에는 그 종류 말고 다른 것으로
      const skip = new Set<QuestType>(
        others
          .map((o) => o.type as QuestType)
          .filter((t) => !['NEXT_DONG', 'FIRST_REVIEWER', 'LOCAL_PICK'].includes(t)),
      );
      if (mode === 'DISMISS') {
        skip.add(quest.type as QuestType);
        await tx.questDislike.upsert({
          where: { userId_type: { userId, type: quest.type } },
          update: { count: { increment: 1 } },
          create: { userId, type: quest.type },
        });
      } else if (quest.type !== 'TIER_UP') {
        // 바꾸기는 같은 종류의 다른 가게·동도 된다. 티어 도전은 가게·동이 없어 다시 고르면 같은 퀘스트라 뺀다
        skip.delete(quest.type as QuestType);
      }
      const picked = await draftQuest(
        tx,
        profile,
        quest.level as QuestLevel,
        Number(questId % 97n) + 11,
        skip,
      );
      if (!picked) throw new AppError(QuestError.QUEST_NO_REPLACEMENT);
      await tx.quest.update({
        where: { id: questId },
        data: { status: mode === 'SWAP' ? 'S' : 'D' },
      });
      if (mode === 'SWAP') {
        await tx.questWeek.update({ where: { id: quest.weekId }, data: { swappedAt: now } });
      }
      const created = await insertQuest(tx, profile, quest.weekId, picked, quest.isBonus);
      const row = await tx.quest.findUniqueOrThrow({
        where: { id: created.id },
        include: QUEST_INCLUDE,
      });
      return questView(row, await viewContext(tx, userId, [row]));
    },
    { timeout: 15_000 },
  );
}

/** QUEST-03 다른 퀘스트로 바꾸기 (주 1번) */
export function swapQuest(userId: bigint, questId: bigint, now = new Date()) {
  return replaceQuest(userId, questId, 'SWAP', now);
}

/** QUEST-04 관심 없어요 (그 종류를 덜 추천하고 다른 퀘스트로 바꾼다, 바꾸기 횟수는 쓰지 않는다) */
export function dismissQuest(userId: bigint, questId: bigint, now = new Date()) {
  return replaceQuest(userId, questId, 'DISMISS', now);
}

/** QUEST-05 퀘스트 기록 (연속 완료, 완료 수·간 곳·받은 포인트, 업적 진행, 지난 주들) */
export async function getQuestRecords(userId: bigint, now = new Date()) {
  const [weeks, totals, places, streak, achievements, owned] = await Promise.all([
    prisma.questWeek.findMany({
      where: { userId },
      orderBy: { weekStart: 'desc' },
      include: {
        quests: { where: { status: { in: ['A', 'C'] } }, select: { isBonus: true, status: true } },
      },
    }),
    prisma.quest.aggregate({
      where: { userId, status: 'C' },
      _count: { _all: true },
      _sum: { rewardPoint: true },
    }),
    prisma.quest.findMany({
      where: { userId, status: 'C', doneRestaurantId: { not: null } },
      distinct: ['doneRestaurantId'],
      select: { doneRestaurantId: true },
    }),
    questStreak(prisma, userId, now),
    prisma.achievement.findMany({
      where: { code: { in: [STREAK_ACHIEVEMENT, PLACES_ACHIEVEMENT] } },
      select: { id: true, code: true, name: true, conditionValue: true },
    }),
    prisma.memberAchievement.findMany({
      where: { userId, achievement: { code: { in: [STREAK_ACHIEVEMENT, PLACES_ACHIEVEMENT] } } },
      select: { achievementId: true },
    }),
  ]);
  const goalOf = (code: string) => {
    const a = achievements.find((x) => x.code === code);
    return a
      ? {
          name: a.name,
          target: a.conditionValue,
          achieved: owned.some((o) => o.achievementId === a.id),
        }
      : null;
  };
  const current = weeks.find((w) => w.weekStart.getTime() === kstWeekStartAsDbDate(now).getTime());
  return {
    streak,
    thisWeekDone: current?.completedAt != null,
    streakGoal: goalOf(STREAK_ACHIEVEMENT),
    placesGoal: goalOf(PLACES_ACHIEVEMENT),
    completedCount: totals._count._all,
    placeCount: places.length,
    pointTotal: totals._sum.rewardPoint ?? 0,
    weeks: weeks.map((w) => weekView(w, w.quests, now)),
  };
}

/** QUEST-06 지난 주 퀘스트 (퀘스트 기록에서 한 주를 누르면) */
export async function getQuestWeek(userId: bigint, weekId: bigint, now = new Date()) {
  const week = await prisma.questWeek.findUnique({ where: { id: weekId } });
  if (!week || week.userId !== userId) throw new AppError(QuestError.QUEST_WEEK_NOT_FOUND);
  const quests = await weekQuests(prisma, week.id);
  const ctx = await viewContext(prisma, userId, quests);
  return { week: weekView(week, quests, now), quests: quests.map((q) => questView(q, ctx)) };
}
