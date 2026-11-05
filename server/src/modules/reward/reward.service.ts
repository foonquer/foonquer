import { type Tx, isUniqueViolation, lockMember } from '../../common/db';
import { AppError } from '../../common/errors/app-error';
import { kstStartOfToday } from '../../common/time';
import { RewardError } from './reward.errors';

// POINT-03 (내부): 먹포인트·경험치 지급. 다른 기능이 같은 트랜잭션 안에서 부른다.
// - 같은 원인(reason + refType + refId)으로는 한 번만 (point_history·exp_history unique)
// - 수치는 reward_policy, 하루 한도는 reward_policy.daily_limit
// - 잔액(member.point_balance)과 내역(point_history)은 같은 트랜잭션에서 바꾼다

export interface RewardRef {
  /** VISIT / REVIEW / REVIEW_REACTION / CONQUEST / ITEM / ACHIEVEMENT / LEVEL / SEASON_RESULT / SEASON_REGION_STAT */
  type: string;
  id: bigint | number;
}

export interface LevelUp {
  from: number;
  to: number;
}

export interface RewardResult {
  point: number;
  exp: number;
  /** 경험치로 레벨이 올랐으면 */
  levelUp: LevelUp | null;
}

const NONE: RewardResult = { point: 0, exp: 0, levelUp: null };

/**
 * 먹포인트를 더한다 (금액을 직접 정할 때: 업적 보상, 시즌 보상, 레벨업). 이미 같은 원인으로 받았으면 0.
 * @returns 실제로 더한 포인트
 */
export async function addPoint(
  tx: Tx,
  userId: bigint,
  amount: number,
  reason: string,
  title: string,
  ref: RewardRef,
  now = new Date(),
): Promise<number> {
  if (amount <= 0) return 0;
  await lockMember(tx, userId);
  const refId = BigInt(ref.id);
  const exists = await tx.pointHistory.findUnique({
    where: {
      userId_reason_refType_refId: { userId, reason, refType: ref.type, refId },
    },
    select: { id: true },
  });
  if (exists) return 0;
  const member = await tx.member.update({
    where: { id: userId },
    data: { pointBalance: { increment: amount } },
    select: { pointBalance: true },
  });
  await tx.pointHistory.create({
    data: {
      userId,
      amount,
      balanceAfter: member.pointBalance,
      reason,
      title: title.slice(0, 60),
      refType: ref.type,
      refId,
      regDate: now,
    },
  });
  return amount;
}

/**
 * 먹포인트를 쓴다 (상점 구매). 잔액이 모자라면 409 POINT_NOT_ENOUGH (data.shortage = 모자란 포인트)
 * @returns 쓴 뒤 잔액
 */
export async function spendPoint(
  tx: Tx,
  userId: bigint,
  amount: number,
  reason: string,
  title: string,
  ref: RewardRef,
  now = new Date(),
): Promise<number> {
  await lockMember(tx, userId);
  const { pointBalance } = await tx.member.findUniqueOrThrow({
    where: { id: userId },
    select: { pointBalance: true },
  });
  if (pointBalance < amount) {
    throw new AppError(RewardError.POINT_NOT_ENOUGH, undefined, {
      balance: pointBalance,
      price: amount,
      shortage: amount - pointBalance,
    });
  }
  const balanceAfter = pointBalance - amount;
  await tx.member.update({ where: { id: userId }, data: { pointBalance: balanceAfter } });
  await tx.pointHistory.create({
    data: {
      userId,
      amount: -amount,
      balanceAfter,
      reason,
      title: title.slice(0, 60),
      refType: ref.type,
      refId: BigInt(ref.id),
      regDate: now,
    },
  });
  return balanceAfter;
}

/** 누적 경험치로 레벨을 찾는다 (level_policy의 required_exp 이하 중 가장 높은 레벨) */
async function levelOfExp(tx: Tx, exp: number) {
  const row = await tx.levelPolicy.findFirst({
    where: { requiredExp: { lte: exp } },
    orderBy: { level: 'desc' },
    select: { level: true },
  });
  return row?.level ?? 1;
}

/**
 * 경험치를 더하고 레벨이 오르면 레벨마다 LEVEL_UP 먹포인트를 준다. 이미 같은 원인으로 받았으면 0.
 * 먹깨비 행이 없으면(프로필 설정 전 테스트 데이터 등) 만든다.
 */
export async function addExp(
  tx: Tx,
  userId: bigint,
  amount: number,
  reason: string,
  ref: RewardRef,
  now = new Date(),
): Promise<{ exp: number; levelUp: LevelUp | null }> {
  if (amount <= 0) return { exp: 0, levelUp: null };
  const refId = BigInt(ref.id);
  try {
    // unique(user_id, reason, ref_type, ref_id)로 한 번만. 먼저 넣고, 이미 있으면 건너뛴다
    await tx.expHistory.create({
      data: { userId, amount, reason, refType: ref.type, refId, levelAfter: 0, regDate: now },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { exp: 0, levelUp: null };
    throw err;
  }
  const before = await tx.mukkaebi.upsert({
    where: { userId },
    update: {},
    create: { userId },
    select: { level: true, exp: true },
  });
  const exp = before.exp + amount;
  const level = await levelOfExp(tx, exp);
  await tx.mukkaebi.update({ where: { userId }, data: { exp, level } });
  await tx.expHistory.updateMany({
    where: { userId, reason, refType: ref.type, refId },
    data: { levelAfter: level },
  });

  let levelUp: LevelUp | null = null;
  if (level > before.level) {
    levelUp = { from: before.level, to: level };
    const policy = await tx.rewardPolicy.findUnique({ where: { reason: 'LEVEL_UP' } });
    for (let lv = before.level + 1; lv <= level; lv += 1) {
      await addPoint(
        tx,
        userId,
        policy?.point ?? 0,
        'LEVEL_UP',
        `레벨업 LV.${lv}`,
        {
          type: 'LEVEL',
          id: lv,
        },
        now,
      );
    }
  }
  return { exp: amount, levelUp };
}

/**
 * reward_policy에 적힌 보상(먹포인트 + 경험치)을 준다. 하루 한도를 넘었거나 이미 받은 원인이면 0.
 * 예) grantReward(tx, userId, 'VISIT_VERIFIED', '새맛집 방문 인증', { type: 'VISIT', id: visit.id })
 */
export async function grantReward(
  tx: Tx,
  userId: bigint,
  reason: string,
  title: string,
  ref: RewardRef,
  now = new Date(),
): Promise<RewardResult> {
  const policy = await tx.rewardPolicy.findUnique({ where: { reason } });
  if (!policy) return NONE;

  if (policy.dailyLimit !== null) {
    await lockMember(tx, userId);
    const today = await tx.pointHistory.count({
      where: { userId, reason, regDate: { gte: kstStartOfToday(now) } },
    });
    if (today >= policy.dailyLimit) return NONE;
  }

  const point = await addPoint(tx, userId, policy.point, reason, title, ref, now);
  // 포인트를 이미 받은 원인이면 경험치도 주지 않는다 (포인트 0 정책은 경험치만 본다)
  if (point === 0 && policy.point > 0) return NONE;
  const { exp, levelUp } = await addExp(tx, userId, policy.exp, reason, ref, now);
  return { point, exp, levelUp };
}

/** 여러 보상 결과를 합친다 (화면의 "+150P 받았어요") */
export function sumRewards(results: RewardResult[]): RewardResult {
  return results.reduce<RewardResult>(
    (acc, r) => ({
      point: acc.point + r.point,
      exp: acc.exp + r.exp,
      levelUp: r.levelUp
        ? { from: acc.levelUp?.from ?? r.levelUp.from, to: r.levelUp.to }
        : acc.levelUp,
    }),
    NONE,
  );
}
