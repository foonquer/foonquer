import { type Tx, lockMember } from '../../common/db';
import { kstStartOfDbDate, kstWeekStartAsDbDate } from '../../common/time';

// 신뢰 온도 (ERD member.trust_temp, trust_temp_log): 1°~99°, 시작 50°.
// 한 주(KST 월요일부터)에 오르는 양은 +7°까지, 75° 이상이면 오르는 양이 절반. 같은 원인(reason + ref)은 한 번만.
// 변화량은 「신뢰 별점 계산 규칙 정리」(2026-11-13, 시뮬레이션 + 설문)의 최종 규칙: 리뷰를 쓸 때 주로 오르고,
// 도움돼요는 리뷰의 절반이며 누른 사람의 온도에 비례한다 (성실 참여자가 6개월에 80°대가 되도록 맞춘 값).
// 내려가는 쪽에는 주 상한이 없다 (가짜는 빨리 내려가고, 신뢰는 천천히 쌓이게).
// 오르는 변화는 일어날 때 바로 반영하고(주 상한으로 묶는다), 합의 일치도 감점만 매주 rating 작업이 계산한다.

export type TrustReason =
  | 'HELPFUL_VISITOR'
  | 'HELPFUL_GUEST'
  | 'REVIEW_WRITTEN'
  | 'REVIEW_DETAIL'
  | 'UNHELPFUL_MANY'
  | 'REPORT_CONFIRMED'
  | 'FAKE_REVIEW'
  | 'CONSENSUS_GAP';

export const TRUST_DELTA: Record<TrustReason, number> = {
  /** 도움돼요 받음 (방문자). 누른 사람 온도 ÷ 50 배 */
  HELPFUL_VISITOR: 0.3,
  /** 도움돼요 받음 (비방문자). 누른 사람 온도 ÷ 50 배 */
  HELPFUL_GUEST: 0.075,
  /** 방문 인증 리뷰(맛 별점) 작성 */
  REVIEW_WRITTEN: 0.6,
  /** 세부평가(세부 별점·글)까지 남김 */
  REVIEW_DETAIL: 0.3,
  UNHELPFUL_MANY: -0.5,
  REPORT_CONFIRMED: -3,
  FAKE_REVIEW: -5,
  /** 합의 일치도 감점. 크기는 scale로 준다 (consensus.ts consensusPenaltyOf × 지난주 새 리뷰 수) */
  CONSENSUS_GAP: -1,
};

const WEEKLY_RISE_LIMIT = 7;
const HALF_RISE_FROM = 75;
const MIN_TEMP = 1;
const MAX_TEMP = 99;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** 도움돼요를 누른 사람의 온도 배율 (50°면 1배, 99°면 1.98배) */
export const voterScale = (voterTemp: number) => voterTemp / 50;

/**
 * 신뢰 온도를 바꾸고 trust_temp_log에 남긴다. 이미 같은 원인으로 바뀐 적이 있으면 아무것도 하지 않는다.
 * scale은 기본 변화량에 곱한다 (도움돼요: 누른 사람 온도 ÷ 50).
 * @returns 실제로 바뀐 양 (한도에 걸리면 0일 수 있다), 이미 반영한 원인이면 null
 */
export async function changeTrustTemp(
  tx: Tx,
  userId: bigint,
  reason: TrustReason,
  ref: { type: 'REVIEW_REACTION' | 'REVIEW' | 'REPORT'; id: bigint },
  actorId: bigint | null = null,
  now = new Date(),
  scale = 1,
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
  const base = round2(TRUST_DELTA[reason] * scale);
  let delta = base;
  if (delta > 0) {
    if (before >= HALF_RISE_FROM) delta /= 2;
    const risen = await tx.trustTempLog.aggregate({
      where: {
        userId,
        regDate: { gte: kstStartOfDbDate(kstWeekStartAsDbDate(now)) },
        appliedDelta: { gt: 0 },
      },
      _sum: { appliedDelta: true },
    });
    const remaining = Math.max(0, WEEKLY_RISE_LIMIT - (risen._sum.appliedDelta?.toNumber() ?? 0));
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
