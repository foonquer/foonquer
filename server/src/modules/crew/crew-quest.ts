import type { Db } from '../../common/db';
import { distanceBetween } from '../../common/geo';
import { Prisma } from '../../generated/prisma/client';
import { placeWord } from '../quest/quest-types';
import { myOverallOf } from '../restaurant/restaurant-stats';
import { weightsOf, WEIGHT_SELECT } from '../user/taste-weights';
import {
  CREW_QUEST_DEFAULT_POINT,
  CREW_QUEST_NAME,
  CREW_QUEST_REASON,
  type CrewQuestType,
} from './crew-types';

// 모임 퀘스트 (팀 공유 4장 "모임 퀘스트"): 이번 주 함께 정복 1개 + 맛집 나눠 찾기 1개.
// 모임원이 2명 이상일 때 그 주에 처음 열면 만든다. 추천은 모임 동네(구) 안에서만

type CrewInfo = { id: bigint; sigunguId: number; sigunguName: string };

async function rewardOf(db: Db, type: CrewQuestType) {
  const policy = await db.rewardPolicy.findUnique({
    where: { reason: CREW_QUEST_REASON[type] },
    select: { point: true },
  });
  return policy?.point ?? CREW_QUEST_DEFAULT_POINT[type];
}

/**
 * 함께 정복할 곳: 모임원 아무도 안 가 본 곳 중 "모두의 만족"(모임원 내 종합 평균)이 높고,
 * 가장 낮게 볼 사람의 점수도 너무 낮지 않은 곳. 별점이 쌓인 곳이 없으면 구 중심에서 가까운 안 가 본 곳
 */
async function pickTogether(db: Db, crew: CrewInfo, memberIds: bigint[]) {
  const [members, visited, center] = await Promise.all([
    db.member.findMany({ where: { id: { in: memberIds } }, select: WEIGHT_SELECT }),
    db.visit.findMany({
      where: { userId: { in: memberIds }, restaurantId: { not: null } },
      distinct: ['restaurantId'],
      select: { restaurantId: true },
    }),
    db.region.findUniqueOrThrow({
      where: { id: crew.sigunguId },
      select: { centerLat: true, centerLng: true },
    }),
  ]);
  const seen = new Set(visited.map((v) => String(v.restaurantId)));
  const weights = members.map(weightsOf);
  const rated = await db.restaurant.findMany({
    where: { status: 'A', sigunguId: crew.sigunguId, restaurantStat: { reviewCount: { gte: 1 } } },
    select: {
      id: true,
      name: true,
      lat: true,
      lng: true,
      category: { select: { name: true } },
      region: { select: { name: true } },
      restaurantStat: true,
    },
    orderBy: { restaurantStat: { reviewCount: 'desc' } },
    take: 300,
  });
  const lat = center.centerLat?.toNumber();
  const lng = center.centerLng?.toNumber();
  const km = (r: { lat: Prisma.Decimal; lng: Prisma.Decimal }) =>
    lat === undefined || lng === undefined
      ? 0
      : distanceBetween(lat, lng, r.lat.toNumber(), r.lng.toNumber()) / 1000;
  const scored = rated
    .filter((r) => !seen.has(r.id.toString()))
    .flatMap((r) => {
      const scores = weights.map((w) => myOverallOf(r.restaurantStat, w).score);
      if (scores.some((s) => s === null)) return [];
      const values = scores as number[];
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      // 한 명이 싫어하는 곳이 뽑히지 않게 가장 낮은 점수도 본다
      return [{ r, mean, score: mean + 0.5 * Math.min(...values) - 0.2 * km(r) }];
    })
    .sort((a, b) => b.score - a.score);
  if (scored[0]) {
    const { r, mean } = scored[0];
    return { r, summary: `${r.name} · 모두의 만족 ${mean.toFixed(1)}` };
  }
  const order =
    lat === undefined || lng === undefined
      ? Prisma.sql`r.id`
      : Prisma.sql`ST_Distance_Sphere(POINT(r.lng, r.lat), POINT(${lng}, ${lat})), r.id`;
  const near = await db.$queryRaw<{ id: bigint }[]>`
    SELECT r.id FROM restaurant r WHERE r.status = 'A' AND r.sigungu_id = ${crew.sigunguId}
    ORDER BY ${order} LIMIT ${20 + Math.min(seen.size, 500)}`;
  const id = near.map((n) => BigInt(n.id)).find((x) => !seen.has(x.toString()));
  if (id === undefined) return null;
  const r = await db.restaurant.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      name: true,
      category: { select: { name: true } },
      region: { select: { name: true } },
    },
  });
  return { r, summary: `${r.name} · ${r.region?.name ?? crew.sigunguName}` };
}

/** 이번 주 모임 퀘스트가 없으면 만든다 (모임원 2명 이상일 때만) */
export async function ensureCrewQuests(db: Db, crew: CrewInfo, weekStart: Date, now: Date) {
  const existing = await db.crewQuest.findMany({ where: { crewId: crew.id, weekStart } });
  if (existing.length > 0) return existing;
  const members = await db.crewMember.findMany({
    where: { crewId: crew.id, status: 'A' },
    select: { userId: true },
  });
  if (members.length < 2) return [];
  const memberIds = members.map((m) => m.userId);
  const together = await pickTogether(db, crew, memberIds);
  const rows: Prisma.CrewQuestCreateManyInput[] = [];
  if (together) {
    rows.push({
      crewId: crew.id,
      weekStart,
      type: 'TOGETHER',
      restaurantId: together.r.id,
      target: 2,
      title: `모두 안 가 본 ${placeWord(together.r.category?.name)}`,
      summary: together.summary,
      rewardPoint: await rewardOf(db, 'TOGETHER'),
      regDate: now,
    });
  }
  rows.push({
    crewId: crew.id,
    weekStart,
    type: 'SPLIT',
    target: members.length,
    title: '각자 다른 곳 1곳씩 정복',
    summary: `${crew.sigunguName} 안에서 ${members.length}명이 겹치지 않게`,
    rewardPoint: await rewardOf(db, 'SPLIT'),
    regDate: now,
  });
  // 동시에 두 번 열어도 (모임, 주, 종류)가 겹치지 않게
  await db.crewQuest.createMany({ data: rows, skipDuplicates: true });
  return db.crewQuest.findMany({ where: { crewId: crew.id, weekStart } });
}

/** 모임 퀘스트 화면 값: 함께 정복은 그 가게를 같이 정복한 모임원, 나눠 찾기는 각자 정복한 모임원 */
export async function crewQuestViews(
  db: Db,
  crewId: bigint,
  quests: Awaited<ReturnType<typeof ensureCrewQuests>>,
  weekStart: Date,
) {
  return Promise.all(
    [...quests]
      .sort((a, b) => (a.type === 'TOGETHER' ? 0 : 1) - (b.type === 'TOGETHER' ? 0 : 1))
      .map(async (q) => {
        const participants =
          q.type === 'SPLIT'
            ? (
                await db.crewQuestEntry.findMany({
                  where: { crewQuestId: q.id },
                  select: { user: { select: { id: true, nickname: true } } },
                })
              ).map((e) => e.user)
            : q.restaurantId
              ? (
                  await db.crewConquestMember.findMany({
                    where: {
                      crewConquest: {
                        crewId,
                        restaurantId: q.restaurantId,
                        conqueredOn: { gte: weekStart },
                      },
                    },
                    distinct: ['userId'],
                    select: { user: { select: { id: true, nickname: true } } },
                  })
                ).map((m) => m.user)
              : [];
        return {
          crewQuestId: q.id,
          type: q.type,
          typeName: CREW_QUEST_NAME[q.type as CrewQuestType] ?? q.type,
          title: q.title,
          summary: q.summary,
          rewardPoint: q.rewardPoint,
          status: q.status === 'C' ? ('DONE' as const) : ('ACTIVE' as const),
          target: q.target,
          progress: participants.length,
          restaurantId: q.restaurantId,
          participants: participants.map((u) => ({ userId: u.id, nickname: u.nickname })),
        };
      }),
  );
}
