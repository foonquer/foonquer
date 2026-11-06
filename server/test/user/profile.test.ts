import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { addDays, kstTodayAsDbDate, toKstIso } from '../../src/common/time';
import { prisma } from '../../src/lib/prisma';
import { readObjectHead } from '../../src/lib/storage';
import { resetDb } from '../helpers/db';
import { agreeConsents, bearer, createMember } from '../helpers/fixtures';
import { imageHead } from '../helpers/image';

// 프로필 사진이 스토리지에 있는지는 테스트마다 정한다 (기본: 없음).
vi.mock('../../src/lib/storage', () => ({
  readObjectHead: vi.fn(() => Promise.resolve(null)),
  deleteObjectQuietly: vi.fn(() => Promise.resolve()),
}));

const app = createApp();

async function regionId(code: string) {
  return (await prisma.region.findUniqueOrThrow({ where: { code } })).id;
}

const GAYANG = '1150010400'; // 강서구 가양동
const YEOKSAM = '1168010100'; // 강남구 역삼동
const SINDANG = '1114016200'; // 중구 신당동
const GANGSEO = '1150000000'; // 강서구

/** 프로필 설정 전(약관 동의 후) 회원 */
async function pendingMember() {
  const member = await createMember({ status: 'P', nickname: null });
  await agreeConsents(member.id);
  return member;
}

async function setupBody(overrides: Record<string, unknown> = {}) {
  return {
    nickname: '먹깨비짱',
    profileImageKey: null,
    gender: 'F',
    ageGroup: 20,
    localRegionIds: [await regionId(GAYANG), await regionId(YEOKSAM)],
    preferredCategoryIds: [6, 1], // 고깃집, 한식
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDb();
  vi.mocked(readObjectHead).mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('USER-01 GET /users/nickname/availability', () => {
  async function check(userId: bigint, nickname?: string) {
    return request(app)
      .get('/api/v1/users/nickname/availability')
      .query(nickname === undefined ? {} : { nickname })
      .set('Authorization', bearer(userId));
  }

  it('쓸 수 있으면 available true', async () => {
    const me = await pendingMember();
    const res = await check(me.id, '  먹깨비짱 ');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('멋진 이름이에요! 사용할 수 있어요.');
    expect(res.body.data).toEqual({ nickname: '먹깨비짱', available: true, reason: null });
  });

  it.each([
    ['a', 'INVALID_LENGTH'],
    ['가나다라마바사아자차카', 'INVALID_LENGTH'],
    ['먹 깨비', 'INVALID_CHARACTER'],
    ['먹깨비!', 'INVALID_CHARACTER'],
    ['ㅋㅋㅋ', 'INVALID_CHARACTER'],
  ])('규칙에 안 맞으면 200 + available false (%s → %s)', async (nickname, reason) => {
    const me = await pendingMember();
    const res = await check(me.id, nickname);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ nickname, available: false, reason });
  });

  it('다른 회원이 쓰고 있으면 DUPLICATE (대소문자 무시)', async () => {
    await createMember({ nickname: 'Mukjjang' });
    const me = await pendingMember();
    const res = await check(me.id, 'MUKJJANG');
    expect(res.body.data).toEqual({ nickname: 'MUKJJANG', available: false, reason: 'DUPLICATE' });
    expect(res.body.message).toBe('이미 누군가 쓰고 있어요.');
  });

  it('지금 내 닉네임이면 SAME_AS_CURRENT', async () => {
    const me = await createMember({ nickname: '내닉네임' });
    const res = await check(me.id, '내닉네임');
    expect(res.body.data).toEqual({
      nickname: '내닉네임',
      available: false,
      reason: 'SAME_AS_CURRENT',
    });
  });

  it('닉네임을 안 보내면 400 NICKNAME_REQUIRED', async () => {
    const me = await pendingMember();
    for (const nickname of [undefined, '', '   ']) {
      const res = await check(me.id, nickname);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('NICKNAME_REQUIRED');
      expect(res.body.message).toBe('닉네임을 입력해 주세요.');
    }
  });

  it('약관 동의 전이면 403 TERMS_REQUIRED', async () => {
    const me = await createMember({ status: 'P', nickname: null });
    const res = await check(me.id, '먹깨비짱');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TERMS_REQUIRED');
  });
});

describe('USER-03 POST /users/me/profile', () => {
  async function setup(userId: bigint, body: unknown) {
    return request(app)
      .post('/api/v1/users/me/profile')
      .set('Authorization', bearer(userId))
      .send(body as object);
  }

  it('프로필을 저장하고 활성 회원이 된다 (내 동네·먹깨비 생성, 환영 정보)', async () => {
    const me = await pendingMember();
    const res = await setup(me.id, await setupBody());

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('프로필을 설정했어요. 첫 맛집을 찾으러 가 볼까요?');
    const { data } = res.body;
    expect(data.nextAction).toBe('HOME');
    expect(data.user).toEqual({
      id: Number(me.id),
      nickname: '먹깨비짱',
      profileImageUrl: null,
      gender: 'F',
      ageGroup: 20,
      status: 'A',
    });
    expect(data.localRegions).toHaveLength(2);
    expect(data.localRegions[0]).toEqual({
      localRegionId: expect.any(Number),
      regionId: await regionId(GAYANG),
      dongName: '가양동',
      sigunguId: await regionId(GANGSEO),
      sigunguName: '강서구',
      sortOrder: 0,
      regDate: expect.stringMatching(/\+09:00$/),
    });
    expect(data.localRegions[1]).toMatchObject({ dongName: '역삼동', sortOrder: 1 });
    // 좋아하는 음식은 칩 순서(카테고리 id 순서)로 돌려준다
    expect(data.preferredCategories).toEqual([
      { categoryId: 1, categoryName: '한식' },
      { categoryId: 6, categoryName: '고깃집' },
    ]);
    expect(data.welcome).toEqual({
      seasonNo: null,
      tierTitle: '강서구 초보 탐방러',
      mukkaebi: { level: 1, stage: 'E' },
      firstGoal: { sigunguName: '강서구', current: 0, target: 5, nextTierName: '단골' },
    });

    const member = await prisma.member.findUniqueOrThrow({ where: { id: me.id } });
    expect(member).toMatchObject({
      status: 'A',
      nickname: '먹깨비짱',
      gender: 'F',
      ageGroup: 20,
      profileImageKey: null,
      // 가입 때 고른 것은 변경 횟수에 세지 않는다
      nicknameChangedAt: null,
      localChangedAt: null,
      // 내 취향을 안 보내면 모두 보통
      weightTaste: 1,
      weightPrice: 1,
    });
    const mukkaebi = await prisma.mukkaebi.findUniqueOrThrow({ where: { userId: me.id } });
    expect(mukkaebi).toMatchObject({ level: 1, exp: 0 });
    const preferred = await prisma.memberPreferredCategory.findMany({
      where: { userId: me.id },
      orderBy: { categoryId: 'asc' },
    });
    expect(preferred.map((p) => p.categoryId)).toEqual([1, 6]);
  });

  it('S-05-2 중요하게 보는 것을 보내면 같이 저장한다', async () => {
    const me = await pendingMember();
    const tasteWeights = {
      taste: 'VERY',
      cleanliness: 'VERY',
      portion: 'NORMAL',
      service: 'NORMAL',
      price: 'IMPORTANT',
    };
    expect((await setup(me.id, await setupBody({ tasteWeights }))).status).toBe(201);
    const member = await prisma.member.findUniqueOrThrow({ where: { id: me.id } });
    expect(member).toMatchObject({
      weightTaste: 3,
      weightCleanliness: 3,
      weightPortion: 1,
      weightService: 1,
      weightPrice: 2,
    });

    const other = await pendingMember();
    const bad = await setup(
      other.id,
      await setupBody({ nickname: '다른깨비', tasteWeights: { ...tasteWeights, price: 'LOW' } }),
    );
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_TASTE_WEIGHT');
  });

  it('진행 중 시즌이 있으면 시즌 번호를, 레벨 정책(기본 데이터)의 단계를 준다', async () => {
    const today = kstTodayAsDbDate();
    await prisma.season.create({
      data: {
        seasonNo: 3,
        startDate: addDays(today, -10),
        endDate: addDays(today, 100),
        status: 'A',
      },
    });
    const me = await pendingMember();

    const res = await setup(me.id, await setupBody({ localRegionIds: [await regionId(SINDANG)] }));
    expect(res.status).toBe(201);
    expect(res.body.data.welcome).toMatchObject({
      seasonNo: 3,
      tierTitle: '중구 초보 탐방러',
      mukkaebi: { level: 1, stage: 'E' },
    });
  });

  it('기본 지급 아이템(unlock_type D)이 있으면 같이 준다', async () => {
    const item = await prisma.item.create({
      data: { code: 'HAT_BASIC', category: 'HAT', name: '기본 모자', unlockType: 'D' },
    });
    await prisma.item.create({
      data: { code: 'HAT_SHOP', category: 'HAT', name: '상점 모자', unlockType: 'P', price: 100 },
    });
    const me = await pendingMember();

    try {
      await setup(me.id, await setupBody());
      const items = await prisma.memberItem.findMany({ where: { userId: me.id } });
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ itemId: item.id, acquiredType: 'D', quantity: 1 });
    } finally {
      // item은 기본 데이터 표라 테스트마다 비우지 않으므로 직접 지운다
      await prisma.memberItem.deleteMany({
        where: { item: { code: { in: ['HAT_BASIC', 'HAT_SHOP'] } } },
      });
      await prisma.item.deleteMany({ where: { code: { in: ['HAT_BASIC', 'HAT_SHOP'] } } });
    }
  });

  it('스토리지에 올린 프로필 사진 key를 저장하고 URL로 준다', async () => {
    const me = await pendingMember();
    const key = `profile/${me.id}/${randomUUID()}.webp`;
    vi.mocked(readObjectHead).mockImplementation((k) => Promise.resolve(imageHead(k)));

    const res = await setup(me.id, await setupBody({ profileImageKey: key }));
    expect(res.status).toBe(201);
    expect(res.body.data.user.profileImageUrl).toBe(`https://images.test/${key}`);
    expect(readObjectHead).toHaveBeenCalledWith(key, 12);
  });

  it.each([
    ['다른 회원 폴더', (id: bigint) => `profile/${id + 1n}/${randomUUID()}.jpg`, true],
    ['허용하지 않는 확장자', (id: bigint) => `profile/${id}/${randomUUID()}.gif`, true],
    ['uuid가 아닌 이름', (id: bigint) => `profile/${id}/photo.jpg`, true],
    ['스토리지에 없음', (id: bigint) => `profile/${id}/${randomUUID()}.png`, false],
  ])('사진 key가 잘못되면 400 PROFILE_IMAGE_NOT_FOUND (%s)', async (_, keyOf, exists) => {
    const me = await pendingMember();
    vi.mocked(readObjectHead).mockImplementation((k) =>
      Promise.resolve(exists ? imageHead(k) : null),
    );
    const res = await setup(me.id, await setupBody({ profileImageKey: keyOf(me.id) }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PROFILE_IMAGE_NOT_FOUND');
    expect(res.body.message).toBe('올린 사진을 찾을 수 없어요. 다시 올려 주세요.');
    const member = await prisma.member.findUniqueOrThrow({ where: { id: me.id } });
    expect(member.status).toBe('P');
  });

  it.each([
    [{ nickname: 'a' }, 'INVALID_NICKNAME', '닉네임은 2~10자 한글·영문·숫자로 입력해 주세요.'],
    [{ nickname: undefined }, 'INVALID_NICKNAME', undefined],
    [{ gender: 'X' }, 'INVALID_GENDER', '성별과 나이대를 골라 주세요.'],
    [{ gender: undefined }, 'INVALID_GENDER', undefined],
    [{ ageGroup: 25 }, 'INVALID_AGE_GROUP', '성별과 나이대를 골라 주세요.'],
    [{ ageGroup: '20' }, 'INVALID_AGE_GROUP', undefined],
    [{ localRegionIds: [] }, 'LOCAL_REGION_COUNT_INVALID', '내 동네는 1~2곳 골라 주세요.'],
    [{ localRegionIds: [1, 2, 3] }, 'LOCAL_REGION_COUNT_INVALID', undefined],
    [{ localRegionIds: undefined }, 'LOCAL_REGION_COUNT_INVALID', undefined],
    [{ localRegionIds: [5, 5] }, 'LOCAL_REGION_DUPLICATE', '같은 동네를 두 번 고를 수 없어요.'],
    [
      { preferredCategoryIds: [] },
      'PREFERRED_CATEGORY_INVALID',
      '좋아하는 음식을 1개 이상 골라 주세요.',
    ],
    [{ preferredCategoryIds: undefined }, 'PREFERRED_CATEGORY_INVALID', undefined],
    [{ preferredCategoryIds: [1, 1] }, 'PREFERRED_CATEGORY_INVALID', undefined],
    [{ preferredCategoryIds: [99] }, 'PREFERRED_CATEGORY_INVALID', undefined],
  ])('입력이 잘못되면 400 (%j → %s)', async (overrides, code, message) => {
    const me = await pendingMember();
    const res = await setup(me.id, await setupBody(overrides));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(code);
    if (message) expect(res.body.message).toBe(message);
  });

  it('구를 고르면 400 REGION_NOT_DONG, 없는 지역이면 404 REGION_NOT_FOUND', async () => {
    const me = await pendingMember();
    const gu = await setup(me.id, await setupBody({ localRegionIds: [await regionId(GANGSEO)] }));
    expect(gu.status).toBe(400);
    expect(gu.body.code).toBe('REGION_NOT_DONG');
    expect(gu.body.message).toBe('동 단위로 골라 주세요.');

    const none = await setup(me.id, await setupBody({ localRegionIds: [99_999_999] }));
    expect(none.status).toBe(404);
    expect(none.body.code).toBe('REGION_NOT_FOUND');
    expect(none.body.message).toBe('동네를 찾을 수 없어요.');
  });

  it('다른 회원이 쓰는 닉네임이면 409 NICKNAME_DUPLICATE', async () => {
    await createMember({ nickname: '먹깨비짱' });
    const me = await pendingMember();
    const res = await setup(me.id, await setupBody());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NICKNAME_DUPLICATE');
    expect(res.body.message).toBe('이미 누군가 쓰고 있어요. 다른 이름은 어때요?');
    expect(await prisma.memberLocalRegion.count()).toBe(0);
  });

  it('이미 프로필을 설정했으면 409 PROFILE_ALREADY_COMPLETED', async () => {
    const me = await createMember();
    const res = await setup(me.id, await setupBody());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PROFILE_ALREADY_COMPLETED');
    expect(res.body.message).toBe('이미 프로필을 설정했어요.');
  });

  it('동시에 두 번 보내도 한 번만 저장된다', async () => {
    const me = await pendingMember();
    const body = await setupBody();
    const results = await Promise.all([setup(me.id, body), setup(me.id, body)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.mukkaebi.count({ where: { userId: me.id } })).toBe(1);
    expect(await prisma.memberLocalRegion.count({ where: { userId: me.id } })).toBe(2);
  });

  it('약관 동의 전이면 403 TERMS_REQUIRED', async () => {
    const me = await createMember({ status: 'P', nickname: null });
    const res = await setup(me.id, await setupBody());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TERMS_REQUIRED');
  });
});

describe('USER-04 GET /users/me', () => {
  it('내 프로필과 내 동네를 준다', async () => {
    const me = await createMember({
      kakaoId: 'kakao-1',
      nickname: '내닉네임',
      gender: 'M',
      ageGroup: 30,
    });
    const gayang = await prisma.region.findUniqueOrThrow({ where: { code: GAYANG } });
    await prisma.memberLocalRegion.create({
      data: { userId: me.id, regionId: gayang.id, sigunguId: gayang.parentId ?? 0, sortOrder: 0 },
    });

    const res = await request(app).get('/api/v1/users/me').set('Authorization', bearer(me.id));
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('내 프로필을 조회했어요.');
    expect(res.body.data).toEqual({
      id: Number(me.id),
      nickname: '내닉네임',
      nicknameChangeableAt: null,
      profileImageUrl: null,
      profileImageSource: 'DEFAULT',
      gender: 'M',
      ageGroup: 30,
      bio: null,
      status: 'A',
      isAdmin: false,
      localRegions: [expect.objectContaining({ dongName: '가양동', sigunguName: '강서구' })],
      regDate: toKstIso(me.regDate),
    });
  });

  it('운영자면 isAdmin', async () => {
    const admin = await createMember({ role: 'A' });
    const res = await request(app).get('/api/v1/users/me').set('Authorization', bearer(admin.id));
    expect(res.body.data.isAdmin).toBe(true);
  });

  it('사진이 있으면 CUSTOM과 사진 주소를 준다', async () => {
    const me = await createMember({ profileImageKey: 'profile/1/a.webp' });
    const res = await request(app).get('/api/v1/users/me').set('Authorization', bearer(me.id));
    expect(res.body.data).toMatchObject({
      profileImageSource: 'CUSTOM',
      profileImageUrl: 'https://images.test/profile/1/a.webp',
    });
  });

  it('최근 30일 안에 닉네임을 바꿨으면 다시 바꿀 수 있는 시각을 준다', async () => {
    const changedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const me = await createMember({ nicknameChangedAt: changedAt });
    const res = await request(app).get('/api/v1/users/me').set('Authorization', bearer(me.id));
    expect(res.body.data.nicknameChangeableAt).toBe(toKstIso(addDays(changedAt, 30)));
  });

  it('약관 동의 전 회원도 조회할 수 있다', async () => {
    const me = await createMember({ status: 'P', nickname: null });
    const res = await request(app).get('/api/v1/users/me').set('Authorization', bearer(me.id));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'P', nickname: null, localRegions: [] });
  });

  it('이용 정지 회원은 403 MEMBER_SUSPENDED', async () => {
    const me = await createMember({ status: 'S' });
    const res = await request(app).get('/api/v1/users/me').set('Authorization', bearer(me.id));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MEMBER_SUSPENDED');
  });
});

describe('USER-05 PATCH /users/me', () => {
  async function update(userId: bigint, body: unknown) {
    return request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', bearer(userId))
      .send(body as object);
  }

  it('보낸 필드만 바꾼다', async () => {
    const me = await createMember({ nickname: '원래닉', gender: 'F', ageGroup: 20 });
    const res = await update(me.id, { ageGroup: 30 });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('프로필을 저장했어요.');
    expect(res.body.data).toEqual({
      id: Number(me.id),
      nickname: '원래닉',
      nicknameChangeableAt: null,
      gender: 'F',
      ageGroup: 30,
      bio: null,
    });
  });

  it('닉네임을 바꾸면 30일 동안 다시 못 바꾼다', async () => {
    const me = await createMember({ nickname: '원래닉' });
    const first = await update(me.id, { nickname: ' 새닉네임 ' });
    expect(first.status).toBe(200);
    expect(first.body.data.nickname).toBe('새닉네임');

    const member = await prisma.member.findUniqueOrThrow({ where: { id: me.id } });
    expect(member.nicknameChangedAt).not.toBeNull();
    const changeableAt = addDays(member.nicknameChangedAt ?? new Date(), 30);
    expect(first.body.data.nicknameChangeableAt).toBe(toKstIso(changeableAt));

    const second = await update(me.id, { nickname: '또바꿀래' });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('NICKNAME_CHANGE_TOO_SOON');
    expect(second.body.message).toMatch(
      /^닉네임은 30일에 한 번 바꿀 수 있어요\. \(\d{1,2}월 \d{1,2}일부터 가능\)$/,
    );
    expect(second.body.data).toEqual({ nicknameChangeableAt: toKstIso(changeableAt) });
  });

  it('30일이 지났으면 다시 바꿀 수 있다', async () => {
    const me = await createMember({
      nickname: '원래닉',
      nicknameChangedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    });
    const res = await update(me.id, { nickname: '새닉네임' });
    expect(res.status).toBe(200);
  });

  it('지금과 같은 닉네임은 변경으로 세지 않는다', async () => {
    const recent = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const me = await createMember({ nickname: '원래닉', nicknameChangedAt: null });
    const res = await update(me.id, { nickname: '원래닉', gender: 'N' });
    expect(res.status).toBe(200);
    const member = await prisma.member.findUniqueOrThrow({ where: { id: me.id } });
    expect(member.nicknameChangedAt).toBeNull();
    expect(member.gender).toBe('N');

    // 30일 제한 중이어도 같은 닉네임이면 막지 않는다
    const limited = await createMember({ nickname: '제한중', nicknameChangedAt: recent });
    const ok = await update(limited.id, { nickname: '제한중', ageGroup: 40 });
    expect(ok.status).toBe(200);
  });

  it('다른 회원이 쓰는 닉네임이면 409 NICKNAME_DUPLICATE', async () => {
    await createMember({ nickname: '인기닉' });
    const me = await createMember({ nickname: '원래닉' });
    const res = await update(me.id, { nickname: '인기닉' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NICKNAME_DUPLICATE');
    expect(res.body.message).toBe('이미 누군가 쓰고 있어요.');
  });

  it.each([
    [{}, 'NO_FIELDS_TO_UPDATE', '바꿀 항목이 없어요.'],
    [{ email: 'x@example.com' }, 'NO_FIELDS_TO_UPDATE', '바꿀 항목이 없어요.'],
    [{ nickname: '!!' }, 'INVALID_NICKNAME', undefined],
    [{ gender: 'X' }, 'INVALID_GENDER', undefined],
    [{ ageGroup: 60 }, 'INVALID_AGE_GROUP', undefined],
  ])('400 %j → %s', async (body, code, message) => {
    const me = await createMember();
    const res = await update(me.id, body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(code);
    if (message) expect(res.body.message).toBe(message);
  });

  it('프로필 설정 전이면 403 PROFILE_REQUIRED', async () => {
    const me = await pendingMember();
    const res = await update(me.id, { gender: 'F' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PROFILE_REQUIRED');
  });
});
