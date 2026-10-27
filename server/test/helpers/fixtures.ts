import { signAccessToken } from '../../src/common/auth/access-token';
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
