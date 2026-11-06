import { type Tx, lockMember } from '../../common/db';
import { kstStartOfToday } from '../../common/time';

// 신뢰 온도 (ERD member.trust_temp, trust_temp_log): 1°~99°, 시작 50°.
// 하루에 오르는 양은 +1°까지, 75° 이상이면 오르는 양이 절반. 같은 원인(reason + ref)은 한 번만.

export type TrustReason =
  | 'HELPFUL_VISITOR'
  | 'HELPFUL_GUEST'
  | 'REVIEW_WRITTEN'
  | 'UNHELPFUL_MANY'
  | 'REPORT_CONFIRMED'
  | 'FAKE_REVIEW';

export const TRUST_DELTA: Record<TrustReason, number> = {
  HELPFUL_VISITOR: 0.2,
  HELPFUL_GUEST: 0.05,
  REVIEW_WRITTEN: 0.1,
  UNHELPFUL_MANY: -0.5,
  REPORT_CONFIRMED: -3,
  FAKE_REVIEW: -5,
};

const DAILY_RISE_LIMIT = 1;
const HALF_RISE_FROM = 75;
const MIN_TEMP = 1;
const MAX_TEMP = 99;
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * 신뢰 온도를 바꾸고 trust_temp_log에 남긴다. 이미 같은 원인으로 바뀐 적이 있으면 아무것도 하지 않는다.
 * @returns 실제로 바뀐 양 (한도에 걸리면 0일 수 있다), 이미 반영한 원인이면 null
 */
export async function changeTrustTemp(
  tx: Tx,
  userId: bigint,
  reason: TrustReason,
  ref: { type: 'REVIEW_REACTION' | 'REVIEW' | 'REPORT'; id: bigint },
  actorId: bigint | null = null,
  now = new Date(),
): Promise<number | null> {
  await lockMember(tx, userId);
  const exists = await tx.trustTempLog.findUnique({
    where: { reason_refType_refId: { reason, refType: ref.type, refId: ref.id } },
    select: { id: true },
  });
  if (exists) return null;

  const member = await tx.member.findUniqueOrThrow({
    where: { id: userId },
    select: { trustTemp: true },
  });
  const before = member.trustTemp.toNumber();
  const base = TRUST_DELTA[reason];
  let delta = base;
  if (delta > 0) {
    if (before >= HALF_RISE_FROM) delta /= 2;
    const risen = await tx.trustTempLog.aggregate({
      where: { userId, regDate: { gte: kstStartOfToday(now) }, appliedDelta: { gt: 0 } },
      _sum: { appliedDelta: true },
    });
    const remaining = Math.max(0, DAILY_RISE_LIMIT - (risen._sum.appliedDelta?.toNumber() ?? 0));
    delta = Math.min(delta, remaining);
  }
  const after = round2(Math.min(MAX_TEMP, Math.max(MIN_TEMP, before + delta)));
  const applied = round2(after - before);

  await tx.trustTempLog.create({
    data: {
      userId,
      reason,
      baseDelta: base,
      appliedDelta: applied,
      tempAfter: after,
      actorId,
      refType: ref.type,
      refId: ref.id,
      regDate: now,
    },
  });
  if (applied !== 0) await tx.member.update({ where: { id: userId }, data: { trustTemp: after } });
  return applied;
}
