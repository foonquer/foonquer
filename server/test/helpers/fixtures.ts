import { signAccessToken } from '../../src/common/auth/access-token';
import { addDays, kstTodayAsDbDate } from '../../src/common/time';
import type { Prisma } from '../../src/generated/prisma/client';
import { prisma } from '../../src/lib/prisma';

let seq = 0;

/** 회원 한 명을 만든다. 기본은 프로필 설정까지 끝난 활성 회원(status A) */
export async function createMember(data: Partial<Prisma.MemberUncheckedCreateInput> = {}) {
  seq += 1;
  return prisma.member.create({
    data: {
      status: 'A',
      nickname: `회원${seq}`,
      ...data,
    },
  });
}

/** 필수 약관 3개(+ 마케팅)에 동의한 기록을 넣는다 */
export async function agreeConsents(userId: bigint, { marketing = false } = {}) {
  const now = new Date();
  await prisma.memberConsent.createMany({
    data: (['TERMS', 'PRIVACY', 'LOCATION', 'MARKETING'] as const).map((consentType) => {
      const agreed = consentType === 'MARKETING' ? marketing : true;
      return {
        userId,
        consentType,
        agreed,
        policyVersion: 'test',
        agreedAt: agreed ? now : null,
      };
    }),
  });
}

/** Authorization 헤더 값 */
export function bearer(userId: bigint) {
  return `Bearer ${signAccessToken(userId)}`;
}

let placeSeq = 0;

/** 가게 한 곳. 기본은 강서구 가양동 중심 좌표의 영업 중 한식집 */
export async function createRestaurant(
  data: Partial<Prisma.RestaurantUncheckedCreateInput> & { dongCode?: string } = {},
) {
  const { dongCode = '1150010400', ...rest } = data;
  const dong = await prisma.region.findUniqueOrThrow({ where: { code: dongCode } });
  placeSeq += 1;
  return prisma.restaurant.create({
    data: {
      bizesId: `test-${placeSeq}`,
      name: `가게${placeSeq}`,
      categoryId: 1,
      regionId: dong.id,
      sigunguId: dong.parentId ?? 0,
      lat: dong.centerLat ?? 37.56,
      lng: dong.centerLng ?? 126.85,
      ...rest,
    },
  });
}

/** 오늘(KST)을 포함하는 진행 중 시즌 */
export async function createActiveSeason(seasonNo = 1) {
  const today = kstTodayAsDbDate();
  return prisma.season.create({
    data: { seasonNo, startDate: addDays(today, -20), endDate: addDays(today, 40), status: 'A' },
  });
}

/** 지난 시즌 (종료) */
export async function createPastSeason(seasonNo = 0) {
  const today = kstTodayAsDbDate();
  return prisma.season.create({
    data: { seasonNo, startDate: addDays(today, -200), endDate: addDays(today, -21), status: 'F' },
  });
}

/** 영수증 방문 인증 한 건. 기본은 정복 완료(C) */
export async function createVisit(
  userId: bigint,
  restaurantId: bigint,
  data: Partial<Prisma.VisitUncheckedCreateInput> = {},
) {
  return prisma.visit.create({
    data: {
      userId,
      restaurantId,
      method: 'R',
      receiptImageKey: 'receipt/test.jpg',
      status: 'C',
      verifiedAt: new Date(),
      ...data,
    },
  });
}

/** 정복 한 건 (정복을 만든 방문 인증과 같이) */
export async function createConquest(
  userId: bigint,
  restaurant: { id: bigint; sigunguId: number },
  seasonId: number,
  conqueredAt = new Date(),
) {
  const visit = await createVisit(userId, restaurant.id, { seasonId });
  const conquest = await prisma.conquest.create({
    data: {
      userId,
      restaurantId: restaurant.id,
      seasonId,
      sigunguId: restaurant.sigunguId,
      visitId: visit.id,
      conqueredAt,
    },
  });
  return { visit, conquest };
}
