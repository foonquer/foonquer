import { CONSENT_TYPES, type ConsentType, findLatestConsents } from '../../common/auth/consent';
import { MemberStatus } from '../../common/auth/member-status';
import { AppError } from '../../common/errors/app-error';
import { kstTodayAsDbDate, toKstIsoOrNull } from '../../common/time';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { AccountError } from './auth.errors';

type Db = Prisma.TransactionClient | typeof prisma;

export interface ConsentInput {
  terms: boolean;
  privacy: boolean;
  location: boolean;
  marketing: boolean;
}

const INPUT_KEY: Record<ConsentType, keyof ConsentInput> = {
  TERMS: 'terms',
  PRIVACY: 'privacy',
  LOCATION: 'location',
  MARKETING: 'marketing',
};

/**
 * 종류별 지금 시행 중인 약관 버전 (effective_date ≤ 오늘(KST) 중 가장 최근).
 * policy_document에는 TERMS·PRIVACY·LOCATION만 있어서, 이벤트·혜택 알림(MARKETING) 동의는
 * 이용약관(TERMS) 버전으로 기록한다.
 */
export async function currentPolicyVersions(db: Db = prisma): Promise<Record<ConsentType, string>> {
  const today = kstTodayAsDbDate();
  const versions: Partial<Record<ConsentType, string>> = {};
  for (const type of ['TERMS', 'PRIVACY', 'LOCATION'] as const) {
    const doc = await db.policyDocument.findFirst({
      where: { type, effectiveDate: { lte: today } },
      orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
      select: { version: true },
    });
    if (!doc) throw new AppError(AccountError.POLICY_DOCUMENT_NOT_FOUND);
    versions[type] = doc.version;
  }
  versions.MARKETING = versions.TERMS;
  return versions as Record<ConsentType, string>;
}

/**
 * 약관 동의를 저장한다. 새 행은 이럴 때만 넣는다(이력 보관):
 * 종류별 행이 없을 때, 동의 여부가 바뀌었을 때, 동의했는데 그사이 약관 버전이 바뀌었을 때.
 * member.marketing_alarm도 marketing 값으로 맞춘다. 필수 동의 확인은 부르는 쪽(요청 검증)에서 한다.
 * 트랜잭션 안에서 불러야 한다 (회원 행을 잠근 뒤 최신 동의를 읽는다).
 * @returns 저장 후 종류별 최신 상태 (TERMS, PRIVACY, LOCATION, MARKETING 순서)
 */
export async function saveConsents(
  db: Prisma.TransactionClient,
  userId: bigint,
  input: ConsentInput,
  now = new Date(),
) {
  // 같은 회원의 동의 저장이 동시에 와도 최신 이력과 marketing_alarm이 어긋나지 않게 차례로 처리한다.
  await db.$queryRaw`SELECT id FROM member WHERE id = ${userId} FOR UPDATE`;
  const versions = await currentPolicyVersions(db);
  const latest = await findLatestConsents(userId, db);

  const toInsert = CONSENT_TYPES.filter((type) => {
    const prev = latest.get(type);
    const agreed = input[INPUT_KEY[type]];
    return !prev || prev.agreed !== agreed || (agreed && prev.policyVersion !== versions[type]);
  }).map((type) => {
    const agreed = input[INPUT_KEY[type]];
    return {
      userId,
      consentType: type,
      agreed,
      policyVersion: versions[type],
      agreedAt: agreed ? now : null,
      withdrawnAt: !agreed && latest.get(type)?.agreed ? now : null,
      regDate: now,
    };
  });

  if (toInsert.length > 0) await db.memberConsent.createMany({ data: toInsert });
  await db.member.update({ where: { id: userId }, data: { marketingAlarm: input.marketing } });

  const after = await findLatestConsents(userId, db);
  return CONSENT_TYPES.map((type) => {
    const row = after.get(type);
    return {
      type,
      agreed: row?.agreed ?? false,
      policyVersion: row?.policyVersion ?? versions[type],
      agreedAt: row?.agreed ? toKstIsoOrNull(row.agreedAt) : null,
    };
  });
}

/** AUTH-15 약관 동의 저장. 이미 동의한 항목은 그대로 두고(멱등) 바뀐 항목만 새로 기록한다 */
export async function saveMemberConsents(userId: bigint, status: string, input: ConsentInput) {
  const consents = await prisma.$transaction((tx) => saveConsents(tx, userId, input));
  return {
    nextAction: status === MemberStatus.PENDING ? ('PROFILE_REQUIRED' as const) : ('HOME' as const),
    consents,
  };
}
