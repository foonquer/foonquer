import { prisma } from '../../lib/prisma';

/** 약관 동의 종류 (member_consent.consent_type) */
export const CONSENT_TYPES = ['TERMS', 'PRIVACY', 'LOCATION', 'MARKETING'] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

/** 필수 동의. 셋 다 동의해야 서비스를 쓸 수 있다 */
export const REQUIRED_CONSENT_TYPES = ['TERMS', 'PRIVACY', 'LOCATION'] as const;

type ConsentReader = Pick<typeof prisma, 'memberConsent'>;

/**
 * 종류별 최신 동의 행(가장 큰 id)을 돌려준다. 동의를 바꿀 때마다 행이 쌓이므로 최신 행이 지금 상태다.
 */
export async function findLatestConsents(userId: bigint, db: ConsentReader = prisma) {
  const rows = await db.memberConsent.findMany({
    where: { userId },
    orderBy: { id: 'desc' },
  });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latest.has(row.consentType)) latest.set(row.consentType, row);
  }
  return latest;
}

/** 필수 약관(이용약관·개인정보·위치기반)에 모두 동의한 상태인지 */
export async function hasRequiredConsents(userId: bigint, db: ConsentReader = prisma) {
  const latest = await findLatestConsents(userId, db);
  return REQUIRED_CONSENT_TYPES.every((type) => latest.get(type)?.agreed === true);
}
