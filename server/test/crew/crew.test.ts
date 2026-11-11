import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from '../helpers/db';
import {
  bearer,
  createActiveSeason,
  createMember,
  createRestaurant,
  createVisit,
} from '../helpers/fixtures';

const app = createApp();
const GAYANG = '1150010400'; // 강서구 가양동
const MAPO_DONG = '1144012000'; // 마포구

beforeEach(async () => {
  await resetDb();
});

const api = (userId: bigint) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set('Authorization', bearer(userId)),
  post: (path: string, body?: object) =>
    request(app).post(`/api/v1${path}`).set('Authorization', bearer(userId)).send(body),
  delete: (path: string) =>
    request(app).delete(`/api/v1${path}`).set('Authorization', bearer(userId)),
});

/** 내 동네가 강서구 가양동인 회원 */
async function member(nickname: string) {
  const me = await createMember({ nickname });
  const gayang = await prisma.region.findUniqueOrThrow({ where: { code: GAYANG } });
  await prisma.memberLocalRegion.create({
    data: { userId: me.id, regionId: gayang.id, sigunguId: gayang.parentId ?? 0 },
  });
  return me;
}

/** 인증 리뷰가 쌓인 가게 */
async function rated(name: string, taste: number) {
  const shop = await createRestaurant({ name });
  await prisma.restaurantStat.create({
    data: {
      restaurantId: shop.id,
      reviewCount: 5,
      displayScore: taste,
      detailReviewCount: 5,
      cleanlinessSum: 20,
      portionSum: 20,
      serviceSum: 20,
      priceSum: 20,
    },
  });
  return shop;
}

/** owner가 만든 친구 모임에 나머지가 초대 코드로 들어온다 */
async function crewOf(owner: bigint, ...others: bigint[]) {
  const created = await api(owner).post('/crews', { type: 'FRIEND', name: '점심 원정대' });
  const { crewId, inviteCode } = created.body.data;
  for (const id of others) await api(id).post(`/crews/join/${inviteCode}`);
  return { crewId: Number(crewId), inviteCode: inviteCode as string };
}

/** minutesAgo분 전에 인증한 방문에 별점을 남긴다 */
async function visitAndRate(
  userId: bigint,
  restaurantId: bigint,
  seasonId: number,
  minutesAgo = 1,
) {
  const visit = await createVisit(userId, restaurantId, {
    status: 'V',
    seasonId,
    verifiedAt: new Date(Date.now() - minutesAgo * 60_000),
  });
  const res = await api(userId).post(`/visits/${visit.id}/rating`, { overallScore: 4 });
  expect(res.status).toBe(201);
  return { visit, res };
}

describe('CREW-01~07 모임 만들기·초대·참여·나가기', () => {
  it('만들면 내 동네 구가 모임 동네, 닉네임으로 초대하면 알림, 수락하면 모임원, 코드로도 들어온다', async () => {
    const minji = await member('민지');
    const junho = await member('준호');
    const seoyeon = await member('서연');

    const created = await api(minji.id).post('/crews', { type: 'FRIEND', name: '점심 원정대' });
    expect(created.status).toBe(201);
    const crew = created.body.data;
    expect(crew).toMatchObject({
      type: 'FRIEND',
      typeName: '친구',
      name: '점심 원정대',
      sigunguName: '강서구',
      memberCount: 1,
      maxMembers: 8,
      isOwner: true,
      badges: [],
      nextBadge: { code: 'FIRST_FEAST', name: '첫 만찬', target: 1 },
      quests: [], // 혼자면 모임 퀘스트가 없다
    });
    expect(crew.inviteCode).toMatch(/^[A-Z]{3}-\d{4}$/);
    expect(crew.members).toMatchObject([{ nickname: '민지', status: 'JOINED', isMe: true }]);

    const invited = await api(minji.id).post(`/crews/${crew.crewId}/invites`, { nickname: '준호' });
    expect(invited.status).toBe(201);
    expect(invited.body.data).toMatchObject({ nickname: '준호', status: 'INVITED' });
    const again = await api(minji.id).post(`/crews/${crew.crewId}/invites`, { nickname: '준호' });
    expect(again.body.code).toBe('CREW_ALREADY_MEMBER');
    const nobody = await api(minji.id).post(`/crews/${crew.crewId}/invites`, { nickname: '없음' });
    expect(nobody.body.code).toBe('CREW_MEMBER_NOT_FOUND');

    // 받은 사람: 알림 → 초대 받기 화면 → 수락
    const notis = await api(junho.id).get('/notifications');
    expect(notis.body.data.items[0]).toMatchObject({
      title: '민지가 "점심 원정대" 모임에 초대했어요',
      deepLink: `/crews/${crew.crewId}/invitation`,
    });
    const mine = await api(junho.id).get('/crews');
    expect(mine.body.data.crews).toEqual([]);
    expect(mine.body.data.invitations).toMatchObject([
      { name: '점심 원정대', inviterNickname: '민지' },
    ]);
    expect((await api(junho.id).get(`/crews/${crew.crewId}`)).body.code).toBe('CREW_NOT_FOUND');
    const invitation = await api(junho.id).get(`/crews/${crew.crewId}/invitation`);
    expect(invitation.body.data).toMatchObject({ inviterNickname: '민지', memberCount: 1 });
    const accepted = await api(junho.id).post(`/crews/${crew.crewId}/invitation`, {
      accept: true,
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.memberCount).toBe(2);

    // 초대 코드 (소문자로 넣어도)
    const code = (crew.inviteCode as string).toLowerCase();
    const preview = await api(seoyeon.id).get(`/crews/join/${code}`);
    expect(preview.body.data).toMatchObject({
      name: '점심 원정대',
      memberCount: 2,
      myStatus: null,
    });
    const joined = await api(seoyeon.id).post(`/crews/join/${code}`);
    expect(joined.body.data.memberCount).toBe(3);
    expect((await api(seoyeon.id).get('/crews/join/ZZZ-0000')).body.code).toBe(
      'INVALID_INVITE_CODE',
    );

    // 나가면 모임 공간을 못 본다
    expect((await api(seoyeon.id).delete(`/crews/${crew.crewId}/members/me`)).status).toBe(200);
    expect((await api(seoyeon.id).get(`/crews/${crew.crewId}`)).body.code).toBe('CREW_NOT_FOUND');
    const list = await api(minji.id).get('/crews');
    expect(list.body.data.crews).toMatchObject([{ name: '점심 원정대', memberCount: 2 }]);
  });

  it('연인은 2명까지 (수락 대기도 센다), 거절하면 다른 사람을 초대할 수 있다', async () => {
    const minji = await member('민지');
    await member('준호');
    await member('서연');
    const created = await api(minji.id).post('/crews', { type: 'COUPLE', name: '우리 둘' });
    const { crewId, maxMembers } = created.body.data;
    expect(maxMembers).toBe(2);

    await api(minji.id).post(`/crews/${crewId}/invites`, { nickname: '준호' });
    const full = await api(minji.id).post(`/crews/${crewId}/invites`, { nickname: '서연' });
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('CREW_FULL');

    const junho = await prisma.member.findFirstOrThrow({ where: { nickname: '준호' } });
    const declined = await api(junho.id).post(`/crews/${crewId}/invitation`, { accept: false });
    expect(declined.body.message).toBe('초대를 거절했어요.');
    const ok = await api(minji.id).post(`/crews/${crewId}/invites`, { nickname: '서연' });
    expect(ok.status).toBe(201);
  });

  it('내 동네가 없고 동네도 안 고르면 만들 수 없다', async () => {
    const me = await createMember();
    const res = await api(me.id).post('/crews', { type: 'FAMILY', name: '우리 가족' });
    expect(res.body.code).toBe('CREW_SIGUNGU_REQUIRED');
  });
});

describe('CREW-08 모임 퀘스트', () => {
  it('2명부터 이번 주 함께 정복(모두 안 가 본 곳 중 모두의 만족이 높은 곳)과 맛집 나눠 찾기를 만든다', async () => {
    const minji = await member('민지');
    const junho = await member('준호');
    const best = await rated('모두맛집', 4.8);
    await rated('그럭저럭', 3.2);
    const been = await rated('가본맛집', 5);
    await createVisit(junho.id, been.id, { verifiedAt: new Date(Date.now() - 40 * 86_400_000) });

    const { inviteCode } = await crewOf(minji.id);
    expect((await api(minji.id).get('/crews/quests')).body.data.items[0].quests).toEqual([]);
    await api(junho.id).post(`/crews/join/${inviteCode}`);

    const res = await api(minji.id).get('/crews/quests');
    expect(res.status).toBe(200);
    const [item] = res.body.data.items;
    expect(item.members).toHaveLength(2);
    expect(item.quests).toMatchObject([
      {
        type: 'TOGETHER',
        typeName: '함께 정복',
        title: '모두 안 가 본 한식집',
        restaurantId: Number(best.id),
        target: 2,
        progress: 0,
        rewardPoint: 100,
        status: 'ACTIVE',
      },
      {
        type: 'SPLIT',
        typeName: '맛집 나눠 찾기',
        summary: '강서구 안에서 2명이 겹치지 않게',
        target: 2,
        rewardPoint: 80,
      },
    ]);
    await api(junho.id).get('/crews/quests');
    expect(await prisma.crewQuest.count()).toBe(2);
  });

  it('같은 날 2시간 안에 같은 가게를 인증·별점 남기면 함께 정복: 배지·퀘스트 포인트·알림, 리뷰는 한 묶음', async () => {
    const season = await createActiveSeason(3);
    const minji = await member('민지');
    const junho = await member('준호');
    const solo = await member('혼밥');
    const shop = await rated('모두맛집', 4.8);
    const { crewId } = await crewOf(minji.id, junho.id);
    await api(minji.id).get(`/crews/${crewId}`); // 이번 주 모임 퀘스트

    // 먼저 남긴 준호는 아직 혼자
    const first = await visitAndRate(junho.id, shop.id, season.id, 30);
    expect(first.res.body.data.crew).toBeNull();
    const second = await visitAndRate(minji.id, shop.id, season.id, 2);
    expect(second.res.body.data.crew).toEqual({
      together: [
        {
          crewId,
          crewName: '점심 원정대',
          partners: ['준호'],
          restaurantName: '모두맛집',
          conquestCount: 1,
          badges: ['첫 만찬'],
          rewardPoint: 100,
        },
      ],
    });

    // 같이 간 두 사람 모두 퀘스트 포인트, 먼저 남긴 사람에게 알림
    const paid = await prisma.pointHistory.findMany({
      where: { reason: 'CREW_TOGETHER' },
      orderBy: { userId: 'asc' },
    });
    expect(paid.map((p) => [p.userId, p.amount])).toEqual([
      [minji.id, 100],
      [junho.id, 100],
    ]);
    const notis = await api(junho.id).get('/notifications');
    expect(notis.body.data.items[0]).toMatchObject({
      title: '민지님과 모두맛집을(를) 함께 정복했어요',
      deepLink: `/crews/${crewId}`,
    });

    // 혼자 남긴 리뷰의 절반씩 (둘이 한 묶음)
    const other = await createRestaurant({ name: '혼자 간 집' });
    const alone = await visitAndRate(solo.id, other.id, season.id);
    const weightOf = async (visitId: bigint) =>
      (await prisma.review.findFirstOrThrow({ where: { visitId } })).scoreWeight.toNumber();
    const single = await weightOf(alone.visit.id);
    const half = Math.round((single / 2) * 1000) / 1000;
    expect(await weightOf(first.visit.id)).toBe(half);
    expect(await weightOf(second.visit.id)).toBe(half);

    // 모임 공간: 정복한 곳·모임원·배지, 퀘스트 완료
    const space = (await api(junho.id).get(`/crews/${crewId}`)).body.data;
    expect(space.conquests).toMatchObject([{ name: '모두맛집', restaurantId: Number(shop.id) }]);
    expect(space.conquests[0].members).toHaveLength(2);
    expect(space.conquests[0]).not.toHaveProperty('verifiedAt');
    expect(space.badges).toEqual([{ code: 'FIRST_FEAST', name: '첫 만찬' }]);
    expect(space.nextBadge).toEqual({ code: 'EXPLORERS', name: '강서 탐험대', target: 5 });
    expect(space.quests[0]).toMatchObject({ type: 'TOGETHER', status: 'DONE', progress: 2 });

    // 3시간 넘게 떨어져 인증하면 묶지 않는다
    const later = await createRestaurant({ name: '따로 간 집' });
    await visitAndRate(junho.id, later.id, season.id, 200);
    const apart = await visitAndRate(minji.id, later.id, season.id, 1);
    expect(apart.res.body.data.crew).toBeNull();
    expect(await prisma.crewConquest.count()).toBe(1);
  });

  it('맛집 나눠 찾기: 모임 동네에서 처음 가 본 곳을 모임원마다 다른 곳으로 채우면 각자 포인트', async () => {
    const season = await createActiveSeason(3);
    const minji = await member('민지');
    const junho = await member('준호');
    const s1 = await createRestaurant({ name: '새집1' });
    const s2 = await createRestaurant({ name: '새집2' });
    const mapo = await createRestaurant({ name: '마포집', dongCode: MAPO_DONG });
    const { crewId } = await crewOf(minji.id, junho.id);
    await api(minji.id).get('/crews/quests');

    await visitAndRate(minji.id, mapo.id, season.id, 300); // 다른 구
    await visitAndRate(minji.id, s1.id, season.id, 250);
    await visitAndRate(minji.id, s2.id, season.id, 200); // 한 사람은 1곳만
    await visitAndRate(junho.id, s1.id, season.id, 100); // 이미 민지가 찾은 곳
    let split = (await api(minji.id).get(`/crews/${crewId}`)).body.data.quests[1];
    expect(split).toMatchObject({ type: 'SPLIT', progress: 1, status: 'ACTIVE' });
    expect(split.participants).toMatchObject([{ nickname: '민지' }]);

    await visitAndRate(junho.id, s2.id, season.id, 1);
    split = (await api(minji.id).get(`/crews/${crewId}`)).body.data.quests[1];
    expect(split).toMatchObject({ progress: 2, status: 'DONE' });
    const paid = await prisma.pointHistory.findMany({ where: { reason: 'CREW_SPLIT' } });
    expect(paid.map((p) => p.amount).sort()).toEqual([80, 80]);
    expect(new Set(paid.map((p) => p.userId.toString()))).toEqual(
      new Set([minji.id.toString(), junho.id.toString()]),
    );
  });
});

describe('SET-02 모임 알림', () => {
  it('모임 알림을 끄고 켠다', async () => {
    const me = await createMember();
    const res = await request(app)
      .patch('/api/v1/users/me/notification-settings')
      .set('Authorization', bearer(me.id))
      .send({ crewAlarm: false });
    expect(res.body.message).toBe('알림 설정을 바꿨어요.');
    expect(res.body.data.crewAlarm).toBe(false);
  });
});
