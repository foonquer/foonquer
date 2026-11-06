import { MemberStatus } from '../../common/auth/member-status';
import { findLatestConsents } from '../../common/auth/consent';
import { AppError } from '../../common/errors/app-error';
import { toKstIso } from '../../common/time';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { purgeMemberFiles } from './member-files';
import { UserError } from './user.errors';
import { WITHDRAWAL_REASONS, type WithdrawalBody } from './user.schema';

/** 칭호 초안: 시즌이 끝나 확정된 구 티어 중 초보 탐방러(B)가 아닌 것 (지현 님 쪽 기준과 맞춰야 한다) */
const BEGINNER_TIER = 'B';

/** SET-03 탈퇴 전 안내: 사라질 기록 */
export async function getWithdrawalSummary(userId: bigint) {
  const [member, conquestRows, mukkaebi, itemCount, titleCount, reviewCount] = await Promise.all([
    prisma.member.findUniqueOrThrow({
      where: { id: userId },
      select: { nickname: true, pointBalance: true },
    }),
    prisma.$queryRaw<{ restaurants: bigint; sigungus: bigint }[]>`
      SELECT COUNT(DISTINCT restaurant_id) AS restaurants, COUNT(DISTINCT sigungu_id) AS sigungus
      FROM conquest WHERE user_id = ${userId}`,
    prisma.mukkaebi.findUnique({ where: { userId }, select: { level: true } }),
    prisma.memberItem.count({ where: { userId, quantity: { gt: 0 } } }),
    prisma.seasonRegionStat.count({
      where: { userId, isFinalized: true, tier: { not: BEGINNER_TIER } },
    }),
    prisma.review.count({ where: { userId, status: 'A' } }),
  ]);
  return {
    nickname: member.nickname,
    conquest: {
      restaurantCount: Number(conquestRows[0]?.restaurants ?? 0),
      sigunguCount: Number(conquestRows[0]?.sigungus ?? 0),
    },
    pointBalance: member.pointBalance,
    mukkaebi: { level: mukkaebi?.level ?? 1, itemCount },
    titleCount,
    reviewCount,
    reasonOptions: WITHDRAWAL_REASONS.map((r) => ({ code: r.code, label: r.label })),
  };
}

/** 탈퇴할 때 회원의 행을 지우는 테이블 (리뷰·방문·신고·운영 기록은 남긴다. 방문은 개인정보만 지운다) */
async function deletePersonalRows(tx: Prisma.TransactionClient, userId: bigint) {
  const where = { userId };
  await tx.refreshToken.deleteMany({ where });
  await tx.memberLocalRegion.deleteMany({ where });
  await tx.memberPreferredCategory.deleteMany({ where });
  await tx.savedRestaurant.deleteMany({ where });
  await tx.memberPick.deleteMany({ where });
  await tx.pushSubscription.deleteMany({ where });
  await tx.searchHistory.deleteMany({ where });
  await tx.memberActivityLog.deleteMany({ where });
  await tx.mukkaebi.deleteMany({ where });
  await tx.memberItemBox.deleteMany({ where });
  await tx.memberItem.deleteMany({ where });
  await tx.memberAchievement.deleteMany({ where });
  await tx.memberRegionBackground.deleteMany({ where });
  await tx.seasonRegionStat.deleteMany({ where });
  await tx.seasonResult.deleteMany({ where });
  await tx.pointHistory.deleteMany({ where });
  await tx.expHistory.deleteMany({ where });
  await tx.notification.deleteMany({ where });
  await tx.memberBlock.deleteMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
  });
}

/**
 * SET-04 회원 탈퇴 (한 트랜잭션). 개인정보·정복·먹깨비·포인트·칭호는 지우고 리뷰는 "탈퇴한 탐험가"로 남긴다.
 * kakao_id를 비우므로 같은 카카오 계정으로 바로 다시 가입할 수 있다(새 회원).
 * @returns 탈퇴 시각
 */
export async function withdrawMember(userId: bigint, body: WithdrawalBody, now = new Date()) {
  const reasonCode = body.reasonCode ?? null;
  const reasonDetail = reasonCode === 'ETC' ? body.reasonDetail?.trim() || null : null;

  await prisma.$transaction(
    async (tx) => {
      // 잠금 순서는 다른 곳과 같게 방문 → 회원. 영수증 처리(processReceipt)·별점 등록은 방문 행을 잠근 뒤 회원 행을 잠근다
      await tx.$queryRaw`SELECT id FROM visit WHERE user_id = ${userId} FOR UPDATE`;
      // 동시에 두 번 눌러도 한 번만 처리되도록 회원 행을 잠근다.
      const [locked] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM member WHERE id = ${userId} FOR UPDATE`;
      if (!locked || locked.status === MemberStatus.WITHDRAWN) {
        throw new AppError(UserError.MEMBER_ALREADY_WITHDRAWN);
      }

      await tx.memberWithdrawal.create({
        data: { userId, reasonCode, reasonDetail, regDate: now },
      });

      // 동의 중인 항목은 철회 이력을 남긴다 (이력 자체는 보관).
      const latest = await findLatestConsents(userId, tx);
      const withdrawn = [...latest.values()]
        .filter((row) => row.agreed)
        .map((row) => ({
          userId,
          consentType: row.consentType,
          agreed: false,
          policyVersion: row.policyVersion,
          agreedAt: null,
          withdrawnAt: now,
          regDate: now,
        }));
      if (withdrawn.length > 0) await tx.memberConsent.createMany({ data: withdrawn });

      // 정복을 지운 만큼 가게의 정복자 수를 줄인다 (같은 가게를 여러 시즌 정복했어도 1명).
      const conquered = await tx.conquest.findMany({
        where: { userId },
        distinct: ['restaurantId'],
        select: { restaurantId: true },
      });
      if (conquered.length > 0) {
        const ids = conquered.map((c) => c.restaurantId);
        await tx.$executeRaw`
          UPDATE restaurant_stat SET conqueror_count = GREATEST(conqueror_count - 1, 0)
          WHERE restaurant_id IN (${Prisma.join(ids)})`;
      }
      await tx.conquest.deleteMany({ where: { userId } });

      // 방문 기록의 개인정보는 바로 지운다(보관 안 함, 2026-11-06). 방문 행은 리뷰가 참조해서 남기고 purged_at을 채운다(ERD v1.3).
      // 방문 행은 맨 처음에 잠갔다: OCR 처리(processReceipt)가 진행 중이면 그 트랜잭션이 끝난 뒤 지우고,
      // 그 뒤에 시작하는 처리는 purged_at을 보고 아무것도 쓰지 않는다. 메뉴 줄은 잠근 뒤에 지워야 새로 들어온 줄까지 지운다
      await tx.visit.updateMany({
        where: { userId, purgedAt: null },
        data: {
          purgedAt: now,
          receiptImageKey: null,
          ocrRaw: Prisma.DbNull,
          ocrStoreName: null,
          ocrBusinessNo: null,
          ocrApprovalNo: null,
          paidAt: null,
          totalAmount: null,
          receiptHash: null,
          checkinLat: null,
          checkinLng: null,
          checkinAccuracy: null,
          checkinDistanceM: null,
          sitePhotoKey: null,
          photoTakenAt: null,
          photoLat: null,
          photoLng: null,
        },
      });
      await tx.visitReceiptItem.deleteMany({ where: { visit: { userId } } });
      // 1:1 문의도 내용·사진째 지운다 (사진 파일은 트랜잭션 뒤 폴더째)
      await tx.inquiry.deleteMany({ where: { userId } });

      await deletePersonalRows(tx, userId);

      await tx.member.update({
        where: { id: userId },
        data: {
          status: MemberStatus.WITHDRAWN,
          deleteDate: now,
          kakaoId: null,
          nickname: null,
          profileImageKey: null,
          gender: null,
          ageGroup: null,
          pointBalance: 0,
        },
      });
    },
    { timeout: 15_000 },
  );

  // DB는 이미 지웠으니 파일 삭제가 실패해도 탈퇴는 성공으로 돌려주고, files_purged_at이 빈 채로 남아 cleanup 작업이 다시 지운다
  await purgeMemberFiles(userId, now);
  return { withdrawnAt: toKstIso(now) };
}
