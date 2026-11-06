import { hasRequiredConsents } from '../../common/auth/consent';
import { MemberStatus } from '../../common/auth/member-status';
import type { Prisma } from '../../generated/prisma/client';
import { publicImageUrl } from '../../lib/image-url';
import { prisma } from '../../lib/prisma';

/** 명세서 nextAction 값 */
export type NextAction = 'HOME' | 'TERMS_REQUIRED' | 'PROFILE_REQUIRED' | 'ACCOUNT_LINK_REQUIRED';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * 로그인 뒤 어느 화면으로 보낼지.
 * 활성 회원은 HOME, 프로필 설정 전(P)은 필수 약관 동의가 남았으면 TERMS_REQUIRED, 아니면 PROFILE_REQUIRED.
 */
export async function nextActionFor(
  member: { id: bigint; status: string },
  db: Db = prisma,
): Promise<Exclude<NextAction, 'ACCOUNT_LINK_REQUIRED'>> {
  if (member.status !== MemberStatus.PENDING) return 'HOME';
  return (await hasRequiredConsents(member.id, db)) ? 'PROFILE_REQUIRED' : 'TERMS_REQUIRED';
}

/** 로그인 응답의 user (AUTH-04, 05, 08, 09 공통). email은 이메일 로그인 계정일 때만 값이 있다 */
export function toAuthUser(member: {
  id: bigint;
  email: string | null;
  nickname: string | null;
  profileImageKey: string | null;
  status: string;
}) {
  return {
    id: member.id,
    email: member.email,
    nickname: member.nickname,
    profileImageUrl: publicImageUrl(member.profileImageKey),
    status: member.status,
  };
}

/** 가린 이메일: 앞 3글자만 보이게 → jun***@email.com */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  return `${local.slice(0, 3)}***${email.slice(at)}`;
}
