import { hasRequiredConsents } from '../../common/auth/consent';
import { MemberStatus } from '../../common/auth/member-status';
import type { Prisma } from '../../generated/prisma/client';
import { publicImageUrl } from '../../lib/image-url';
import { prisma } from '../../lib/prisma';

/** 명세서 nextAction 값 */
export type NextAction = 'HOME' | 'TERMS_REQUIRED' | 'PROFILE_REQUIRED';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * 로그인 뒤 어느 화면으로 보낼지.
 * 활성 회원은 HOME, 프로필 설정 전(P)은 필수 약관 동의가 남았으면 TERMS_REQUIRED, 아니면 PROFILE_REQUIRED.
 */
export async function nextActionFor(
  member: { id: bigint; status: string },
  db: Db = prisma,
): Promise<NextAction> {
  if (member.status !== MemberStatus.PENDING) return 'HOME';
  return (await hasRequiredConsents(member.id, db)) ? 'PROFILE_REQUIRED' : 'TERMS_REQUIRED';
}

/** 로그인 응답의 user (AUTH-08) */
export function toAuthUser(member: {
  id: bigint;
  nickname: string | null;
  profileImageKey: string | null;
  status: string;
}) {
  return {
    id: member.id,
    nickname: member.nickname,
    profileImageUrl: publicImageUrl(member.profileImageKey),
    status: member.status,
  };
}
