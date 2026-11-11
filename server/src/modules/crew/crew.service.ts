import { randomInt } from 'node:crypto';
import type { Db } from '../../common/db';
import { AppError } from '../../common/errors/app-error';
import { withSubjectParticle } from '../../common/josa';
import { formatDbDate, kstWeekStartAsDbDate } from '../../common/time';
import { Prisma } from '../../generated/prisma/client';
import { publicImageUrl } from '../../lib/image-url';
import { prisma } from '../../lib/prisma';
import { notify } from '../notification/notify';
import { ratingOf } from '../restaurant/restaurant-stats';
import { crewQuestViews, ensureCrewQuests } from './crew-quest';
import {
  badgeName,
  CREW_BADGES,
  CREW_MAX,
  CREW_TYPE_API,
  CREW_TYPE_NAME,
  CREW_TYPE_OF,
  type CrewType,
} from './crew-types';
import { CrewError } from './crew.errors';

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** 초대 코드 예) MJK-4821 */
function newInviteCode() {
  const letters = Array.from({ length: 3 }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]);
  return `${letters.join('')}-${String(randomInt(10_000)).padStart(4, '0')}`;
}

const CREW_SELECT = {
  id: true,
  type: true,
  name: true,
  inviteCode: true,
  ownerId: true,
  sigungu: { select: { id: true, name: true } },
  members: {
    where: { status: { in: ['A', 'I'] } },
    orderBy: { joinedAt: 'asc' },
    select: {
      status: true,
      user: {
        select: {
          id: true,
          nickname: true,
          profileImageKey: true,
          mukkaebi: { select: { level: true, hatItem: { select: { code: true } } } },
        },
      },
    },
  },
} satisfies Prisma.CrewSelect;

type CrewRow = Prisma.CrewGetPayload<{ select: typeof CREW_SELECT }>;

function memberViews(crew: CrewRow, userId: bigint) {
  return crew.members.map((m) => ({
    userId: m.user.id,
    nickname: m.user.nickname,
    profileImageUrl: publicImageUrl(m.user.profileImageKey),
    hatCode: m.user.mukkaebi?.hatItem?.code ?? null,
    status: m.status === 'A' ? ('JOINED' as const) : ('INVITED' as const),
    isMe: m.user.id === userId,
  }));
}

function crewHead(crew: CrewRow, userId: bigint) {
  const type = crew.type as CrewType;
  const joined = crew.members.filter((m) => m.status === 'A');
  return {
    crewId: crew.id,
    type: CREW_TYPE_API[type],
    typeName: CREW_TYPE_NAME[type],
    name: crew.name,
    sigunguId: crew.sigungu.id,
    sigunguName: crew.sigungu.name,
    memberCount: joined.length,
    maxMembers: CREW_MAX[type],
    isOwner: crew.ownerId === userId,
  };
}

/** 참여 중인 모임만 볼 수 있다 (없거나 참여 중이 아니면 404) */
async function findMyCrew(db: Db, userId: bigint, crewId: bigint) {
  const crew = await db.crew.findUnique({ where: { id: crewId }, select: CREW_SELECT });
  if (!crew || !crew.members.some((m) => m.user.id === userId && m.status === 'A')) {
    throw new AppError(CrewError.CREW_NOT_FOUND);
  }
  return crew;
}

/** CREW-01 모임 만들기 (만든 사람은 바로 참여). 동네를 안 고르면 내 동네(첫 번째)의 구 */
export async function createCrew(
  userId: bigint,
  body: { type: keyof typeof CREW_TYPE_OF; name: string; sigunguId?: number },
  now = new Date(),
) {
  const sigunguId =
    body.sigunguId ??
    (
      await prisma.memberLocalRegion.findFirst({
        where: { userId },
        orderBy: { sortOrder: 'asc' },
        select: { sigunguId: true },
      })
    )?.sigunguId;
  if (!sigunguId) throw new AppError(CrewError.CREW_SIGUNGU_REQUIRED);
  const sigungu = await prisma.region.findUnique({
    where: { id: sigunguId },
    select: { level: true },
  });
  if (sigungu?.level !== 2) throw new AppError(CrewError.CREW_SIGUNGU_REQUIRED);
  for (let attempt = 0; ; attempt += 1) {
    try {
      const crew = await prisma.crew.create({
        data: {
          type: CREW_TYPE_OF[body.type],
          name: body.name,
          sigunguId,
          inviteCode: newInviteCode(),
          ownerId: userId,
          regDate: now,
          members: { create: { userId, status: 'A', joinedAt: now } },
        },
        select: { id: true },
      });
      return getCrew(userId, crew.id);
    } catch (err) {
      // 초대 코드가 겹치면 새 코드로 다시
      const dup = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!dup || attempt >= 4) throw err;
    }
  }
}

/** CREW-02 내 모임 (참여 중) + 받은 초대 */
export async function listMyCrews(userId: bigint, now = new Date()) {
  const rows = await prisma.crewMember.findMany({
    where: { userId, status: { in: ['A', 'I'] } },
    orderBy: { crewId: 'asc' },
    select: {
      status: true,
      inviter: { select: { nickname: true } },
      crew: { select: CREW_SELECT },
    },
  });
  const weekStart = kstWeekStartAsDbDate(now);
  const crews = await Promise.all(
    rows
      .filter((r) => r.status === 'A')
      .map(async ({ crew }) => {
        const [conquestCount, activeQuests] = await Promise.all([
          prisma.crewConquest.count({ where: { crewId: crew.id } }),
          prisma.crewQuest.count({ where: { crewId: crew.id, weekStart, status: 'A' } }),
        ]);
        return {
          ...crewHead(crew, userId),
          members: memberViews(crew, userId).filter((m) => m.status === 'JOINED'),
          conquestCount,
          activeQuestCount: activeQuests,
        };
      }),
  );
  const invitations = rows
    .filter((r) => r.status === 'I')
    .map(({ crew, inviter }) => ({
      ...crewHead(crew, userId),
      inviterNickname: inviter?.nickname ?? null,
    }));
  return { crews, invitations };
}

/** CREW-03 모임 공간: 모임원, 이번 주 모임 퀘스트, 함께 정복한 곳(지도·목록), 배지 */
export async function getCrew(userId: bigint, crewId: bigint, now = new Date()) {
  const crew = await findMyCrew(prisma, userId, crewId);
  const weekStart = kstWeekStartAsDbDate(now);
  const quests = await ensureCrewQuests(
    prisma,
    { id: crew.id, sigunguId: crew.sigungu.id, sigunguName: crew.sigungu.name },
    weekStart,
    now,
  );
  const [conquests, badges] = await Promise.all([
    prisma.crewConquest.findMany({
      where: { crewId },
      orderBy: [{ conqueredOn: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        conqueredOn: true,
        restaurant: {
          select: { id: true, name: true, lat: true, lng: true, restaurantStat: true },
        },
        members: { select: { user: { select: { id: true, nickname: true } } } },
      },
    }),
    prisma.crewBadge.findMany({ where: { crewId }, orderBy: { regDate: 'asc' } }),
  ]);
  const next = CREW_BADGES.find((b) => !badges.some((x) => x.code === b.code));
  return {
    ...crewHead(crew, userId),
    inviteCode: crew.inviteCode,
    members: memberViews(crew, userId),
    conquestCount: conquests.length,
    quests: await crewQuestViews(prisma, crewId, quests, weekStart),
    // 모임원에게는 정복한 가게·날짜·맛 별점만 (방문 시각·위치는 보여 주지 않는다)
    conquests: conquests.map((c) => ({
      crewConquestId: c.id,
      date: formatDbDate(c.conqueredOn),
      restaurantId: c.restaurant.id,
      name: c.restaurant.name,
      lat: c.restaurant.lat.toNumber(),
      lng: c.restaurant.lng.toNumber(),
      tasteScore: ratingOf(c.restaurant.restaurantStat).score,
      members: c.members.map((m) => ({ userId: m.user.id, nickname: m.user.nickname })),
    })),
    badges: badges.map((b) => ({ code: b.code, name: badgeName(b.code, crew.sigungu.name) })),
    nextBadge: next
      ? { code: next.code, name: badgeName(next.code, crew.sigungu.name), target: next.target }
      : null,
  };
}

/** 모임 인원이 다 찼는지 (참여 중 + 수락 대기) */
async function assertRoom(db: Db, crewId: bigint, type: string) {
  const count = await db.crewMember.count({ where: { crewId, status: { in: ['A', 'I'] } } });
  if (count >= CREW_MAX[type as CrewType]) throw new AppError(CrewError.CREW_FULL);
}

/** CREW-04 닉네임으로 초대 (받은 사람에게 알림) */
export async function inviteMember(
  userId: bigint,
  crewId: bigint,
  nickname: string,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM crew WHERE id = ${crewId} FOR UPDATE`;
    const crew = await findMyCrew(tx, userId, crewId);
    const target = await tx.member.findFirst({
      where: { nickname, status: 'A' },
      select: { id: true, nickname: true },
    });
    if (!target) throw new AppError(CrewError.CREW_MEMBER_NOT_FOUND);
    const existing = await tx.crewMember.findUnique({
      where: { crewId_userId: { crewId, userId: target.id } },
    });
    if (existing && ['A', 'I'].includes(existing.status)) {
      throw new AppError(CrewError.CREW_ALREADY_MEMBER);
    }
    await assertRoom(tx, crewId, crew.type);
    const data = { status: 'I', invitedBy: userId, invitedAt: now, joinedAt: null };
    await tx.crewMember.upsert({
      where: { crewId_userId: { crewId, userId: target.id } },
      update: data,
      create: { crewId, userId: target.id, ...data },
    });
    const inviter = crew.members.find((m) => m.user.id === userId)?.user.nickname ?? '모임원';
    await notify(
      tx,
      target.id,
      {
        category: 'RANK',
        type: 'CREW_INVITE',
        title: `${withSubjectParticle(inviter)} "${crew.name}" 모임에 초대했어요`,
        content: `${CREW_TYPE_NAME[crew.type as CrewType]} 모임 · ${crew.sigungu.name} · 같이 정복해 보세요`,
        refType: 'CREW_INVITE',
        refId: crewId,
      },
      now,
    );
    return { userId: target.id, nickname: target.nickname, status: 'INVITED' as const };
  });
}

/** CREW-05 초대 코드로 모임 미리 보기 (참여 전, 초대 받기 화면) */
export async function previewByCode(userId: bigint, code: string) {
  const crew = await prisma.crew.findUnique({
    where: { inviteCode: code.toUpperCase() },
    select: CREW_SELECT,
  });
  if (!crew) throw new AppError(CrewError.INVALID_INVITE_CODE);
  const mine = crew.members.find((m) => m.user.id === userId);
  return {
    ...crewHead(crew, userId),
    members: memberViews(crew, userId).filter((m) => m.status === 'JOINED'),
    myStatus: mine ? (mine.status === 'A' ? 'JOINED' : 'INVITED') : null,
  };
}

/** 참여: 초대 받은 사람은 수락, 코드로 온 사람은 바로 참여 */
async function join(userId: bigint, crewId: bigint, now: Date) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM crew WHERE id = ${crewId} FOR UPDATE`;
    const crew = await tx.crew.findUniqueOrThrow({ where: { id: crewId }, select: { type: true } });
    const existing = await tx.crewMember.findUnique({
      where: { crewId_userId: { crewId, userId } },
    });
    if (existing?.status === 'A') return;
    if (existing?.status !== 'I') await assertRoom(tx, crewId, crew.type);
    await tx.crewMember.upsert({
      where: { crewId_userId: { crewId, userId } },
      update: { status: 'A', joinedAt: now },
      create: { crewId, userId, status: 'A', joinedAt: now },
    });
  });
}

/** CREW-05 초대 코드로 참여 */
export async function joinByCode(userId: bigint, code: string, now = new Date()) {
  const crew = await prisma.crew.findUnique({
    where: { inviteCode: code.toUpperCase() },
    select: { id: true },
  });
  if (!crew) throw new AppError(CrewError.INVALID_INVITE_CODE);
  await join(userId, crew.id, now);
  return getCrew(userId, crew.id, now);
}

/** CREW-06 받은 초대 보기 (초대 받기 화면) */
export async function getInvitation(userId: bigint, crewId: bigint) {
  const row = await prisma.crewMember.findUnique({
    where: { crewId_userId: { crewId, userId } },
    select: {
      status: true,
      inviter: { select: { nickname: true } },
      crew: { select: CREW_SELECT },
    },
  });
  if (!row || row.status !== 'I') throw new AppError(CrewError.CREW_INVITATION_NOT_FOUND);
  return {
    ...crewHead(row.crew, userId),
    members: memberViews(row.crew, userId).filter((m) => m.status === 'JOINED'),
    inviterNickname: row.inviter?.nickname ?? null,
  };
}

/** CREW-06 받은 초대 수락·거절 */
export async function respondInvitation(
  userId: bigint,
  crewId: bigint,
  accept: boolean,
  now = new Date(),
) {
  const row = await prisma.crewMember.findUnique({ where: { crewId_userId: { crewId, userId } } });
  if (!row || row.status !== 'I') throw new AppError(CrewError.CREW_INVITATION_NOT_FOUND);
  if (!accept) {
    await prisma.crewMember.update({
      where: { crewId_userId: { crewId, userId } },
      data: { status: 'R' },
    });
    return null;
  }
  await join(userId, crewId, now);
  return getCrew(userId, crewId, now);
}

/** CREW-07 모임 나가기 (함께 정복 기록은 남는다) */
export async function leaveCrew(userId: bigint, crewId: bigint) {
  await findMyCrew(prisma, userId, crewId);
  await prisma.crewMember.update({
    where: { crewId_userId: { crewId, userId } },
    data: { status: 'L' },
  });
}

/** CREW-08 퀘스트 시트의 모임 퀘스트 탭: 내 모임마다 이번 주 모임 퀘스트 */
export async function listCrewQuests(userId: bigint, now = new Date()) {
  const weekStart = kstWeekStartAsDbDate(now);
  const rows = await prisma.crewMember.findMany({
    where: { userId, status: 'A' },
    orderBy: { crewId: 'asc' },
    select: { crew: { select: CREW_SELECT } },
  });
  const items = [];
  for (const { crew } of rows) {
    const quests = await ensureCrewQuests(
      prisma,
      { id: crew.id, sigunguId: crew.sigungu.id, sigunguName: crew.sigungu.name },
      weekStart,
      now,
    );
    items.push({
      ...crewHead(crew, userId),
      members: memberViews(crew, userId).filter((m) => m.status === 'JOINED'),
      quests: await crewQuestViews(prisma, crew.id, quests, weekStart),
    });
  }
  return { items };
}
