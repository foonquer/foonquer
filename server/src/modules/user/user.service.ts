import { MemberStatus } from '../../common/auth/member-status';
import { AppError } from '../../common/errors/app-error';
import { findCurrentSeason } from '../../common/season';
import { toKoreanMonthDay, toKstIso, toKstIsoOrNull } from '../../common/time';
import { Prisma } from '../../generated/prisma/client';
import { publicImageUrl } from '../../lib/image-url';
import { prisma } from '../../lib/prisma';
import { requireSeoulDong } from '../region/region.service';
import { listLocalRegions } from './local-region.service';
import { assertProfileImage } from './profile-image.service';
import { nicknameChangeableAt, nicknameProblem } from './nickname';
import { UserError } from './user.errors';
import type { ProfileSetupBody, ProfileUpdateBody } from './user.schema';

// 신규 회원은 모든 구에서 "초보 탐방러"(season_region_stat.tier = B, 0~4곳)로 시작하고,
// 5곳을 정복하면 "단골"(R)이 된다 (ERD v0.7). 티어 기준을 바꾸면 랭킹 쪽과 같이 바꾼다.
const FIRST_TIER_NAME = '초보 탐방러';
const NEXT_TIER = { name: '단골', target: 5 };

/** USER-01 닉네임 중복 확인 (확인만 하고 선점하지 않는다) */
export async function checkNicknameAvailability(userId: bigint, nickname: string) {
  const problem = nicknameProblem(nickname);
  if (problem) {
    return {
      data: { nickname, available: false, reason: problem },
      message:
        problem === 'INVALID_LENGTH'
          ? '닉네임은 2~10자로 입력해 주세요.'
          : '닉네임은 한글·영문·숫자만 쓸 수 있어요.',
    };
  }

  // 비교는 DB 정렬 규칙(utf8mb4_0900_ai_ci)대로 대소문자를 구분하지 않는다. 탈퇴 회원은 닉네임을 비워 둔다.
  const owner = await prisma.member.findFirst({
    where: { nickname, status: { not: MemberStatus.WITHDRAWN } },
    select: { id: true },
  });
  if (owner?.id === userId) {
    return {
      data: { nickname, available: false, reason: 'SAME_AS_CURRENT' },
      message: '지금 쓰고 있는 닉네임이에요.',
    };
  }
  if (owner) {
    return {
      data: { nickname, available: false, reason: 'DUPLICATE' },
      message: '이미 누군가 쓰고 있어요.',
    };
  }
  return {
    data: { nickname, available: true, reason: null },
    message: '멋진 이름이에요! 사용할 수 있어요.',
  };
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** S-05-1에서 고른 카테고리가 모두 있는지 확인하고 id 순서(= 칩 순서)로 돌려준다 */
async function requirePreferredCategories(ids: number[]) {
  const categories = await prisma.category.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (categories.length !== ids.length) throw new AppError(UserError.PREFERRED_CATEGORY_INVALID);
  return categories;
}

/**
 * USER-03 프로필 설정 완료 (S-04 ~ S-06을 한 번에 저장).
 * 회원 상태를 P → A로 바꾸고 좋아하는 음식(S-05-1), 내 동네와 먹깨비(LV.1 알)를 만든다. 한 트랜잭션.
 */
export async function completeProfile(userId: bigint, body: ProfileSetupBody, now = new Date()) {
  const regions = await Promise.all(body.localRegionIds.map((id) => requireSeoulDong(id)));
  const preferredCategories = await requirePreferredCategories(body.preferredCategoryIds);
  if (body.profileImageKey) await assertProfileImage(userId, body.profileImageKey);

  try {
    await prisma.$transaction(async (tx) => {
      // 동시에 두 번 눌러도 한 번만 처리되도록 회원 행을 잠근다.
      const locked = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM member WHERE id = ${userId} FOR UPDATE`;
      if (locked[0]?.status !== MemberStatus.PENDING) {
        throw new AppError(UserError.PROFILE_ALREADY_COMPLETED);
      }
      const taken = await tx.member.findFirst({
        where: {
          nickname: body.nickname,
          status: { not: MemberStatus.WITHDRAWN },
          id: { not: userId },
        },
        select: { id: true },
      });
      if (taken) throw new AppError(UserError.NICKNAME_DUPLICATE);

      // 가입 때 고른 닉네임·동네는 변경 횟수에 세지 않으므로 nickname_changed_at·local_changed_at은 그대로 둔다.
      await tx.member.update({
        where: { id: userId },
        data: {
          nickname: body.nickname,
          profileImageKey: body.profileImageKey ?? null,
          gender: body.gender,
          ageGroup: body.ageGroup,
          status: MemberStatus.ACTIVE,
        },
      });
      await tx.memberLocalRegion.createMany({
        data: regions.map(({ dong, sigungu }, sortOrder) => ({
          userId,
          regionId: dong.id,
          sigunguId: sigungu.id,
          sortOrder,
          regDate: now,
        })),
      });
      await tx.memberPreferredCategory.createMany({
        data: preferredCategories.map((c) => ({ userId, categoryId: c.id, regDate: now })),
      });
      await tx.mukkaebi.create({ data: { userId } });

      // 기본 지급 아이템(item.unlock_type = D)이 있으면 같이 준다 (지금은 없음).
      const defaults = await tx.item.findMany({
        where: { unlockType: 'D', status: 'A' },
        select: { id: true },
      });
      if (defaults.length > 0) {
        await tx.memberItem.createMany({
          data: defaults.map((item) => ({
            userId,
            itemId: item.id,
            acquiredType: 'D',
            acquiredAt: now,
          })),
          skipDuplicates: true,
        });
      }
    });
  } catch (err) {
    // 같은 닉네임으로 동시에 저장하면 nickname unique 제약에 걸린다.
    if (isUniqueViolation(err)) throw new AppError(UserError.NICKNAME_DUPLICATE);
    throw err;
  }

  const [member, localRegions, season, levelOne] = await Promise.all([
    prisma.member.findUniqueOrThrow({ where: { id: userId } }),
    listLocalRegions(userId),
    findCurrentSeason(),
    prisma.levelPolicy.findUnique({ where: { level: 1 }, select: { stage: true } }),
  ]);
  const firstSigungu = localRegions[0]?.sigunguName ?? '';

  return {
    nextAction: 'HOME' as const,
    user: {
      id: member.id,
      nickname: member.nickname,
      profileImageUrl: publicImageUrl(member.profileImageKey),
      gender: member.gender,
      ageGroup: member.ageGroup,
      status: member.status,
    },
    localRegions,
    preferredCategories: preferredCategories.map((c) => ({
      categoryId: c.id,
      categoryName: c.name,
    })),
    welcome: {
      seasonNo: season?.seasonNo ?? null,
      tierTitle: `${firstSigungu} ${FIRST_TIER_NAME}`,
      mukkaebi: { level: 1, stage: levelOne?.stage ?? 'E' },
      firstGoal: {
        sigunguName: firstSigungu,
        current: 0,
        target: NEXT_TIER.target,
        nextTierName: NEXT_TIER.name,
      },
    },
  };
}

/** USER-04 내 프로필 조회 */
export async function getMyProfile(userId: bigint, now = new Date()) {
  const member = await prisma.member.findUniqueOrThrow({ where: { id: userId } });
  const localRegions = await listLocalRegions(userId);
  return {
    id: member.id,
    nickname: member.nickname,
    nicknameChangeableAt: toKstIsoOrNull(nicknameChangeableAt(member.nicknameChangedAt, now)),
    profileImageUrl: publicImageUrl(member.profileImageKey),
    profileImageSource: member.profileImageKey ? 'CUSTOM' : 'DEFAULT',
    gender: member.gender,
    ageGroup: member.ageGroup,
    status: member.status,
    localRegions,
    regDate: toKstIso(member.regDate),
  };
}

/** USER-05 프로필 수정. 보낸 필드만 바꾸고, 닉네임은 30일에 한 번 */
export async function updateMyProfile(userId: bigint, body: ProfileUpdateBody, now = new Date()) {
  if (body.nickname === undefined && body.gender === undefined && body.ageGroup === undefined) {
    throw new AppError(UserError.NO_FIELDS_TO_UPDATE);
  }

  const member = await prisma.member.findUniqueOrThrow({ where: { id: userId } });
  const data: Prisma.MemberUpdateInput = {};
  if (body.gender !== undefined) data.gender = body.gender;
  if (body.ageGroup !== undefined) data.ageGroup = body.ageGroup;

  // 지금과 똑같은 닉네임은 변경으로 세지 않는다.
  if (body.nickname !== undefined && body.nickname !== member.nickname) {
    const changeableAt = nicknameChangeableAt(member.nicknameChangedAt, now);
    if (changeableAt) {
      throw new AppError(
        UserError.NICKNAME_CHANGE_TOO_SOON,
        `닉네임은 30일에 한 번 바꿀 수 있어요. (${toKoreanMonthDay(changeableAt)}부터 가능)`,
        { nicknameChangeableAt: toKstIso(changeableAt) },
      );
    }
    const taken = await prisma.member.findFirst({
      where: {
        nickname: body.nickname,
        status: { not: MemberStatus.WITHDRAWN },
        id: { not: userId },
      },
      select: { id: true },
    });
    if (taken) throw new AppError(UserError.NICKNAME_DUPLICATE, '이미 누군가 쓰고 있어요.');
    data.nickname = body.nickname;
    data.nicknameChangedAt = now;
  }

  let updated;
  try {
    updated = await prisma.member.update({ where: { id: userId }, data });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(UserError.NICKNAME_DUPLICATE, '이미 누군가 쓰고 있어요.');
    }
    throw err;
  }
  return {
    id: updated.id,
    nickname: updated.nickname,
    nicknameChangeableAt: toKstIsoOrNull(nicknameChangeableAt(updated.nicknameChangedAt, now)),
    gender: updated.gender,
    ageGroup: updated.ageGroup,
  };
}
