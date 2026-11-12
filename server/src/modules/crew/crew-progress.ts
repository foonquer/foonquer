import type { Tx } from '../../common/db';
import { withObjectParticle } from '../../common/josa';
import { kstTodayAsDbDate, kstWeekStartAsDbDate } from '../../common/time';
import { notify } from '../notification/notify';
import { refreshReviewWeight } from '../restaurant/restaurant-stat-calc';
import { addPoint } from '../reward/reward.service';
import {
  badgeName,
  CREW_BADGES,
  CREW_QUEST_NAME,
  CREW_QUEST_REASON,
  TOGETHER_WINDOW_MS,
} from './crew-types';

export interface CrewTogether {
  crewId: bigint;
  crewName: string;
  /** 같이 정복한 다른 모임원 닉네임 */
  partners: string[];
  restaurantName: string;
  /** 이 모임이 함께 정복한 곳 수 (이번 포함) */
  conquestCount: number;
  /** 이번에 받은 모임 배지 */
  badges: string[];
  /** 배지와 함께 내가 받은 아이템 (단골 모임 → 모임 단체 모자) */
  rewardItems: { itemId: number; code: string; name: string }[];
  /** 모임 퀘스트 "함께 정복"을 깼으면 각자 받은 먹포인트 (아니면 0) */
  rewardPoint: number;
}

/**
 * 별점 등록(REVIEW-01) 때 내 모임들의 함께 정복·모임 퀘스트를 진행한다 (정복과 같은 트랜잭션).
 * - 함께 정복: 같은 가게에서 같은 날 2시간 안에 인증하고 별점까지 남긴 모임원끼리 묶는다.
 *   묶인 모임원 리뷰는 가중치를 다시 계산한다 (한 묶음으로 반영 — refreshReviewWeight)
 * - 모임 퀘스트 "함께 정복": 그 가게를 모임원 2명 이상이 같이 정복하면 같이 간 모임원 각자 포인트
 * - 모임 퀘스트 "맛집 나눠 찾기": 모임 동네에서 처음 가 보는 곳을 모임원마다 다른 곳으로 1곳씩 → 모두 채우면 각자 포인트
 * 함께 정복한 게 없으면 null
 */
export async function advanceCrews(
  tx: Tx,
  input: { userId: bigint; visitId: bigint; restaurantId: bigint; isFirstEver: boolean; now: Date },
): Promise<{ together: CrewTogether[] } | null> {
  const { userId, visitId, restaurantId, now } = input;
  const memberships = await tx.crewMember.findMany({
    where: { userId, status: 'A' },
    select: {
      crew: {
        select: { id: true, name: true, sigunguId: true, sigungu: { select: { name: true } } },
      },
    },
  });
  if (memberships.length === 0) return null;
  const [visit, restaurant] = await Promise.all([
    tx.visit.findUniqueOrThrow({ where: { id: visitId }, select: { verifiedAt: true } }),
    tx.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { name: true, sigunguId: true },
    }),
  ]);
  const at = (visit.verifiedAt ?? now).getTime();
  const day = kstTodayAsDbDate(new Date(at));
  const weekStart = kstWeekStartAsDbDate(now);
  const together: CrewTogether[] = [];

  for (const { crew } of memberships) {
    const mates = await tx.crewMember.findMany({
      where: { crewId: crew.id, status: 'A', userId: { not: userId } },
      select: { userId: true },
    });
    const visits = mates.length
      ? await tx.visit.findMany({
          where: {
            userId: { in: mates.map((m) => m.userId) },
            restaurantId,
            status: 'C',
            verifiedAt: {
              gte: new Date(at - TOGETHER_WINDOW_MS),
              lte: new Date(at + TOGETHER_WINDOW_MS),
            },
          },
          orderBy: { verifiedAt: 'asc' },
          select: { id: true, userId: true, verifiedAt: true },
        })
      : [];
    const sameDay = visits.filter(
      (v) => v.verifiedAt && kstTodayAsDbDate(v.verifiedAt).getTime() === day.getTime(),
    );
    if (sameDay.length > 0) {
      const group = await tx.crewConquest.upsert({
        where: {
          crewId_restaurantId_conqueredOn: { crewId: crew.id, restaurantId, conqueredOn: day },
        },
        update: {},
        create: { crewId: crew.id, restaurantId, conqueredOn: day, regDate: now },
      });
      const firstVisitOf = new Map<string, bigint>();
      for (const v of sameDay)
        if (!firstVisitOf.has(v.userId.toString())) firstVisitOf.set(v.userId.toString(), v.id);
      await tx.crewConquestMember.createMany({
        data: [
          { crewConquestId: group.id, userId, visitId, regDate: now },
          ...[...firstVisitOf].map(([uid, vid]) => ({
            crewConquestId: group.id,
            userId: BigInt(uid),
            visitId: vid,
            regDate: now,
          })),
        ],
        skipDuplicates: true,
      });
      const members = await tx.crewConquestMember.findMany({
        where: { crewConquestId: group.id },
        select: { userId: true, visitId: true, user: { select: { nickname: true } } },
      });
      // 같이 간 모임원 리뷰를 한 묶음으로 (내 리뷰는 REVIEW-01이 바로 뒤에 다시 계산한다)
      const others = await tx.review.findMany({
        where: { visitId: { in: members.map((m) => m.visitId) }, userId: { not: userId } },
        select: { id: true },
      });
      for (const r of others) await refreshReviewWeight(tx, r.id);

      const conquestCount = await tx.crewConquest.count({ where: { crewId: crew.id } });
      const owned = await tx.crewBadge.findMany({
        where: { crewId: crew.id },
        select: { code: true },
      });
      const newBadges = CREW_BADGES.filter(
        (b) => conquestCount >= b.target && !owned.some((o) => o.code === b.code),
      );
      if (newBadges.length > 0) {
        await tx.crewBadge.createMany({
          data: newBadges.map((b) => ({ crewId: crew.id, code: b.code, regDate: now })),
          skipDuplicates: true,
        });
      }
      const rewardItems = await giveBadgeItems(tx, crew, newBadges, userId, now);

      let rewardPoint = 0;
      const quest = await tx.crewQuest.findUnique({
        where: { crewId_weekStart_type: { crewId: crew.id, weekStart, type: 'TOGETHER' } },
      });
      if (quest && quest.restaurantId === restaurantId) {
        if (quest.status === 'A') {
          await tx.crewQuest.update({
            where: { id: quest.id },
            data: { status: 'C', completedAt: now },
          });
        }
        // 같이 간 모임원 각자 (addPoint가 같은 퀘스트는 한 번만 준다 — 나중에 묶인 사람도 한 번씩)
        for (const m of members) {
          await addPoint(
            tx,
            m.userId,
            quest.rewardPoint,
            CREW_QUEST_REASON.TOGETHER,
            `모임 퀘스트 · ${CREW_QUEST_NAME.TOGETHER}`,
            { type: 'CREW_QUEST', id: quest.id },
            now,
          );
        }
        rewardPoint = quest.rewardPoint;
      }
      const me = members.find((m) => m.userId === userId)?.user.nickname ?? '모임원';
      // 먼저 별점을 남긴 모임원에게도 함께 정복을 알린다
      for (const m of members) {
        if (m.userId === userId) continue;
        await notify(
          tx,
          m.userId,
          {
            category: 'RANK',
            type: 'CREW_TOGETHER',
            title: `${me}님과 ${withObjectParticle(restaurant.name)} 함께 정복했어요`,
            content: `${crew.name} · 함께 정복 ${conquestCount}곳째`,
            refType: 'CREW',
            refId: crew.id,
          },
          now,
        );
      }
      together.push({
        crewId: crew.id,
        crewName: crew.name,
        partners: members
          .filter((m) => m.userId !== userId)
          .map((m) => m.user.nickname ?? '모임원'),
        restaurantName: restaurant.name,
        conquestCount,
        badges: newBadges.map((b) => badgeName(b.code, crew.sigungu.name)),
        rewardItems,
        rewardPoint,
      });
    }

    // 맛집 나눠 찾기: 모임 동네에서 처음 가 본 곳, 모임원마다 다른 곳
    if (input.isFirstEver && restaurant.sigunguId === crew.sigunguId) {
      const split = await tx.crewQuest.findUnique({
        where: { crewId_weekStart_type: { crewId: crew.id, weekStart, type: 'SPLIT' } },
      });
      if (split?.status === 'A') {
        const taken = await tx.crewQuestEntry.findFirst({
          where: { crewQuestId: split.id, OR: [{ userId }, { restaurantId }] },
        });
        if (!taken) {
          await tx.crewQuestEntry.create({
            data: { crewQuestId: split.id, userId, restaurantId, regDate: now },
          });
          const done = await tx.crewQuestEntry.count({ where: { crewQuestId: split.id } });
          if (done >= split.target) {
            await tx.crewQuest.update({
              where: { id: split.id },
              data: { status: 'C', completedAt: now },
            });
            const all = await tx.crewMember.findMany({
              where: { crewId: crew.id, status: 'A' },
              select: { userId: true },
            });
            for (const m of all) {
              await addPoint(
                tx,
                m.userId,
                split.rewardPoint,
                CREW_QUEST_REASON.SPLIT,
                `모임 퀘스트 · ${CREW_QUEST_NAME.SPLIT}`,
                { type: 'CREW_QUEST', id: split.id },
                now,
              );
            }
          }
        }
      }
    }
  }
  return together.length > 0 ? { together } : null;
}

/**
 * 모임 배지에 걸린 아이템(단골 모임 → 모임 단체 모자)을 지금 참여 중인 모임원 모두에게 준다.
 * 이미 가진 사람(다른 모임에서 받음)은 그대로 둔다.
 * @returns 별점을 남긴 내가 이번에 받은 아이템
 */
async function giveBadgeItems(
  tx: Tx,
  crew: { id: bigint; name: string; sigungu: { name: string } },
  badges: readonly (typeof CREW_BADGES)[number][],
  userId: bigint,
  now: Date,
) {
  const mine: CrewTogether['rewardItems'] = [];
  for (const badge of badges) {
    if (!badge.itemCode) continue;
    const item = await tx.item.findFirst({
      where: { code: badge.itemCode, status: 'A' },
      select: { id: true, code: true, name: true },
    });
    if (!item) continue;
    const members = await tx.crewMember.findMany({
      where: {
        crewId: crew.id,
        status: 'A',
        user: { memberItems: { none: { itemId: item.id, quantity: { gt: 0 } } } },
      },
      select: { userId: true },
    });
    for (const m of members) {
      await tx.memberItem.upsert({
        where: { userId_itemId: { userId: m.userId, itemId: item.id } },
        update: { quantity: 1, acquiredType: 'C', acquiredAt: now, seenAt: null },
        create: { userId: m.userId, itemId: item.id, acquiredType: 'C', acquiredAt: now },
      });
      await notify(
        tx,
        m.userId,
        {
          category: 'MUKKAEBI',
          type: 'NEW_ITEM',
          title: `${withObjectParticle(item.name)} 얻었어요!`,
          content: `${crew.name} "${badgeName(badge.code, crew.sigungu.name)}" 배지 보상이에요. 꾸미기에서 착용해 보세요`,
          refType: 'ITEM',
          refId: item.id,
        },
        now,
      );
      if (m.userId === userId) mine.push({ itemId: item.id, code: item.code, name: item.name });
    }
  }
  return mine;
}
