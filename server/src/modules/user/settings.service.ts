import { AppError } from '../../common/errors/app-error';
import { toKstIso, toKstIsoOrNull } from '../../common/time';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { currentPolicyVersions } from '../auth/consent.service';
import { listLocalRegions } from './local-region.service';
import { UserError } from './user.errors';
import type { NotificationSettingsBody } from './user.schema';

type Db = Prisma.TransactionClient | typeof prisma;

/** 이벤트·혜택 알림(MARKETING) 동의를 마지막으로 바꾼 시각 = 최신 member_consent 행의 reg_date */
async function marketingConsentChangedAt(db: Db, userId: bigint) {
  const latest = await db.memberConsent.findFirst({
    where: { userId, consentType: 'MARKETING' },
    orderBy: { id: 'desc' },
    select: { regDate: true },
  });
  return latest?.regDate ?? null;
}

async function notificationOf(db: Db, userId: bigint) {
  const member = await db.member.findUniqueOrThrow({
    where: { id: userId },
    select: { conquestAlarm: true, rankAlarm: true, marketingAlarm: true },
  });
  return {
    conquestAlarm: member.conquestAlarm,
    rankAlarm: member.rankAlarm,
    marketingAlarm: member.marketingAlarm,
    marketingConsentChangedAt: toKstIsoOrNull(await marketingConsentChangedAt(db, userId)),
  };
}

/** SET-01 설정 조회: 알림 3종, 내 동네, 연결된 계정(카카오) */
export async function getSettings(userId: bigint) {
  const [notification, localRegions, member] = await Promise.all([
    notificationOf(prisma, userId),
    listLocalRegions(userId),
    prisma.member.findUniqueOrThrow({ where: { id: userId }, select: { regDate: true } }),
  ]);
  return {
    notification,
    localRegions,
    account: { provider: 'KAKAO' as const, joinedAt: toKstIso(member.regDate) },
  };
}

/**
 * SET-02 알림 설정 변경. 보낸 항목만 바꾼다.
 * 이벤트·혜택 알림은 광고성 정보 수신 동의라서 값이 실제로 바뀌면 member_consent(MARKETING)에 새 행을 남긴다.
 */
export async function updateNotificationSettings(
  userId: bigint,
  body: NotificationSettingsBody,
  now = new Date(),
) {
  if (
    body.conquestAlarm === undefined &&
    body.rankAlarm === undefined &&
    body.marketingAlarm === undefined
  ) {
    throw new AppError(UserError.NO_FIELDS_TO_UPDATE);
  }

  return prisma.$transaction(async (tx) => {
    // 같은 회원의 토글이 동시에 와도 동의 이력과 marketing_alarm이 어긋나지 않게 차례로 처리한다.
    const [locked] = await tx.$queryRaw<{ marketing_alarm: number | boolean }[]>`
      SELECT marketing_alarm FROM member WHERE id = ${userId} FOR UPDATE`;
    const marketingBefore = Boolean(locked?.marketing_alarm);
    const marketingChanged =
      body.marketingAlarm !== undefined && body.marketingAlarm !== marketingBefore;

    await tx.member.update({
      where: { id: userId },
      data: {
        conquestAlarm: body.conquestAlarm,
        rankAlarm: body.rankAlarm,
        marketingAlarm: body.marketingAlarm,
      },
    });
    if (marketingChanged) {
      const versions = await currentPolicyVersions(tx);
      await tx.memberConsent.create({
        data: {
          userId,
          consentType: 'MARKETING',
          agreed: body.marketingAlarm === true,
          policyVersion: versions.MARKETING,
          agreedAt: body.marketingAlarm ? now : null,
          withdrawnAt: body.marketingAlarm ? null : now,
          regDate: now,
        },
      });
    }

    const data = await notificationOf(tx, userId);
    let message = '알림 설정을 바꿨어요.';
    if (marketingChanged) {
      message = body.marketingAlarm
        ? '이벤트·혜택 알림 수신에 동의했어요.'
        : '이벤트·혜택 알림 수신을 거부했어요.';
    }
    return { data, message };
  });
}
