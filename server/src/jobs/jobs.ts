import { MemberStatus } from '../common/auth/member-status';
import { addDays } from '../common/time';
import { prisma } from '../lib/prisma';
import { KEEP_DAYS } from '../modules/notification/notification.service';
import { notify } from '../modules/notification/notify';
import { runSeasonJob } from '../modules/ranking/season-job';
import { purgeMemberFiles } from '../modules/user/member-files';
import {
  loadRatingParams,
  refreshRestaurantStat,
  refreshReviewWeight,
} from '../modules/restaurant/restaurant-stat-calc';

// 하루 1번 도는 작업 (pnpm -C server job <이름>, 운영은 crontab — README "주기 작업")

/** 리뷰가 이만큼 쌓여야 전체 평균 m을 실제 평균으로 바꾼다 (그 전에는 초기값 3.8) */
const GLOBAL_MEAN_MIN_REVIEWS = 30;

/** rating: 전체 평균 m 갱신, 작성자 온도·시간 감쇠를 반영해 리뷰 가중치와 가게 별점을 다시 계산 */
export async function runRatingJob(now = new Date()) {
  const agg = await prisma.review.aggregate({
    where: { status: 'A' },
    _avg: { overallScore: true },
    _count: true,
  });
  if (agg._count >= GLOBAL_MEAN_MIN_REVIEWS && agg._avg.overallScore) {
    const mean = Math.round(agg._avg.overallScore.toNumber() * 10_000) / 10_000;
    await prisma.ratingParam.upsert({
      where: { code: 'GLOBAL_MEAN' },
      update: { value: mean },
      create: { code: 'GLOBAL_MEAN', value: mean, description: '전체 평균 별점 m' },
    });
  }
  const params = await loadRatingParams(prisma);
  const restaurants = await prisma.review.findMany({
    where: { status: 'A' },
    distinct: ['restaurantId'],
    select: { restaurantId: true },
  });
  // 가게 하나가 실패해도 나머지는 계속 갱신하고, 실패 수를 돌려준다(run.ts가 종료 코드 1로)
  let failed = 0;
  for (const { restaurantId } of restaurants) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const reviews = await tx.review.findMany({
            where: { restaurantId, status: 'A' },
            select: { id: true },
          });
          for (const r of reviews) await refreshReviewWeight(tx, r.id, params);
          await refreshRestaurantStat(tx, restaurantId, now, params);
        },
        { timeout: 15_000 },
      );
    } catch (err) {
      failed += 1;
      console.error(`[job] rating 가게 ${restaurantId.toString()} 실패`, err);
    }
  }
  return { restaurants: restaurants.length, reviewCount: agg._count, failed };
}

/** cleanup이 한 번에 다시 지울 탈퇴 회원 수 (파일 삭제가 실패했던 회원) */
const FILE_SWEEP_BATCH = 100;

/** 탈퇴할 때 사진 폴더 삭제가 실패한 회원(files_purged_at이 비어 있음)의 폴더를 다시 지운다. 다 지울 때까지 매일 다시 한다 */
async function sweepWithdrawnFiles(now: Date) {
  const members = await prisma.member.findMany({
    where: { status: MemberStatus.WITHDRAWN, filesPurgedAt: null },
    orderBy: { id: 'asc' },
    take: FILE_SWEEP_BATCH,
    select: { id: true },
  });
  let failed = 0;
  for (const { id } of members) if (!(await purgeMemberFiles(id, now))) failed += 1;
  return { withdrawnMembers: members.length, failed };
}

/** cleanup: 30일 지난 알림, 만료된 로그인 토큰·카카오 결과 교환 코드 삭제, 탈퇴 회원 파일 다시 지우기 */
export async function runCleanupJob(now = new Date()) {
  const dayAgo = addDays(now, -1);
  const [notifications, refreshTokens, tempTokens, files] = await Promise.all([
    prisma.notification.deleteMany({ where: { regDate: { lt: addDays(now, -KEEP_DAYS) } } }),
    prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: dayAgo } }, { revokedAt: { lt: dayAgo } }] },
    }),
    prisma.authTemporaryToken.deleteMany({ where: { expiresAt: { lt: dayAgo } } }),
    sweepWithdrawnFiles(now),
  ]);
  return {
    notifications: notifications.count,
    refreshTokens: refreshTokens.count,
    temporaryTokens: tempTokens.count,
    withdrawnFileMembers: files.withdrawnMembers,
    // run.ts가 failed > 0이면 종료 코드 1로 알린다
    failed: files.failed,
  };
}

/** 저장한 지 이만큼 지나면 "이번 주에 가 볼까요?" 알림 (피그마 알림함, 맛집 추가 "2주 뒤에 알려 주기") */
export const SAVED_REMIND_DAYS = 12;

/** saved-reminder: 저장 12일이 지났고 아직 정복하지 않은 가게를 한 번 알린다 (remind = true만) */
export async function runSavedReminderJob(now = new Date()) {
  const due = await prisma.savedRestaurant.findMany({
    where: {
      remind: true,
      remindedAt: null,
      regDate: { lte: addDays(now, -SAVED_REMIND_DAYS) },
      user: { status: 'A' },
    },
    include: { restaurant: { select: { id: true, name: true, status: true } } },
  });
  let sent = 0;
  for (const s of due) {
    const conquered = await prisma.conquest.count({
      where: { userId: s.userId, restaurantId: s.restaurantId },
    });
    await prisma.$transaction(async (tx) => {
      // 먼저 선점한다: 작업이 겹쳐 돌아도 두 번째는 count 0이라 알림을 또 보내지 않는다
      const { count } = await tx.savedRestaurant.updateMany({
        where: { userId: s.userId, restaurantId: s.restaurantId, remindedAt: null },
        data: { remindedAt: now },
      });
      if (count === 0) return;
      if (!conquered && s.restaurant.status === 'A') {
        await notify(
          tx,
          s.userId,
          {
            category: 'REVIEW',
            type: 'SAVED_REMINDER',
            title: `저장한 '${s.restaurant.name}', 이번 주에 가 볼까요?`,
            content: `저장한 지 ${SAVED_REMIND_DAYS}일이 지났어요`,
            refType: 'RESTAURANT',
            refId: s.restaurant.id,
          },
          now,
        );
        sent += 1;
      }
    });
  }
  return { checked: due.length, sent };
}

export const JOBS = {
  rating: runRatingJob,
  season: runSeasonJob,
  cleanup: runCleanupJob,
  'saved-reminder': runSavedReminderJob,
} as const;

export type JobName = keyof typeof JOBS;
