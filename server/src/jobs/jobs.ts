import { MemberStatus } from '../common/auth/member-status';
import { addDays } from '../common/time';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { type BucketKind, deleteObjectQuietly, listObjects } from '../lib/storage';
import { KEEP_DAYS } from '../modules/notification/notification.service';
import { notify } from '../modules/notification/notify';
import { runSeasonJob } from '../modules/ranking/season-job';
import { analyzeReview, reviewAiEnabled } from '../modules/review/review-ai';
import { runStoreImportJob } from '../modules/restaurant/store-import';
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

/** cleanup이 다시 지울 탈퇴 회원을 한 번에 읽는 수 (파일 삭제가 실패했던 회원) */
export const FILE_SWEEP_BATCH = 100;

/**
 * 탈퇴할 때 사진 폴더 삭제가 실패한 회원(files_purged_at이 비어 있음)의 폴더를 다시 지운다. 다 지울 때까지 매일 다시 한다.
 * id 커서로 끝까지 돌아서, 계속 실패하는 회원이 앞에 쌓여도 뒤의 회원을 막지 않는다
 */
async function sweepWithdrawnFiles(now: Date) {
  let cursor = 0n;
  let total = 0;
  let failed = 0;
  for (;;) {
    const members = await prisma.member.findMany({
      where: { status: MemberStatus.WITHDRAWN, filesPurgedAt: null, id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: FILE_SWEEP_BATCH,
      select: { id: true },
    });
    if (members.length === 0) break;
    for (const { id } of members) if (!(await purgeMemberFiles(id, now))) failed += 1;
    total += members.length;
    cursor = members[members.length - 1].id;
  }
  return { withdrawnMembers: total, failed };
}

/** 올린 뒤 이만큼 지나도 어디에도 저장되지 않은 사진은 지운다 (업로드 URL은 5분이고, 리뷰를 쓰는 동안 여유를 둔다) */
export const ORPHAN_UPLOAD_GRACE_DAYS = 1;
/** 한 번에 DB에서 쓰이는지 확인하는 key 수 */
const ORPHAN_CHECK_BATCH = 500;

/**
 * 사진 폴더별로 그 key를 저장하는 칸. 여기 없는 폴더(구 배경·아이콘 등)는 지우지 않는다.
 * 새로 사진을 저장하는 칸을 만들면 반드시 여기에 더한다 (빠지면 쓰는 사진이 지워진다)
 */
const UPLOAD_FOLDERS: {
  prefix: string;
  kind: BucketKind;
  used: (keys: string[]) => Promise<(string | null)[]>;
}[] = [
  {
    prefix: 'profile/',
    kind: 'public',
    used: async (keys) =>
      (
        await prisma.member.findMany({
          where: { profileImageKey: { in: keys } },
          select: { profileImageKey: true },
        })
      ).map((r) => r.profileImageKey),
  },
  {
    prefix: 'review/',
    kind: 'public',
    used: async (keys) =>
      (
        await prisma.reviewImage.findMany({
          where: { imageKey: { in: keys } },
          select: { imageKey: true },
        })
      ).map((r) => r.imageKey),
  },
  {
    prefix: 'receipt/',
    kind: 'private',
    used: async (keys) =>
      (
        await prisma.visit.findMany({
          where: { receiptImageKey: { in: keys } },
          select: { receiptImageKey: true },
        })
      ).map((r) => r.receiptImageKey),
  },
  {
    prefix: 'site/',
    kind: 'private',
    used: async (keys) =>
      (
        await prisma.visit.findMany({
          where: { sitePhotoKey: { in: keys } },
          select: { sitePhotoKey: true },
        })
      ).map((r) => r.sitePhotoKey),
  },
  {
    prefix: 'inquiry/',
    kind: 'private',
    used: async (keys) =>
      (
        await prisma.inquiry.findMany({
          where: { imageKey: { in: keys } },
          select: { imageKey: true },
        })
      ).map((r) => r.imageKey),
  },
];

/**
 * 올렸지만 어디에도 저장되지 않은 사진(업로드 뒤 저장 API가 실패하거나 화면을 떠난 경우)을 지운다.
 * 폴더 목록을 못 읽으면 그 폴더는 건너뛰고 failed로 센다
 */
async function sweepOrphanUploads(now: Date) {
  const cutoff = addDays(now, -ORPHAN_UPLOAD_GRACE_DAYS);
  let deleted = 0;
  let failed = 0;
  for (const folder of UPLOAD_FOLDERS) {
    try {
      const old = (await listObjects(folder.prefix, folder.kind))
        .filter((o) => o.createdAt < cutoff)
        .map((o) => o.key);
      for (let i = 0; i < old.length; i += ORPHAN_CHECK_BATCH) {
        const keys = old.slice(i, i + ORPHAN_CHECK_BATCH);
        const used = new Set(await folder.used(keys));
        for (const key of keys) {
          if (used.has(key)) continue;
          await deleteObjectQuietly(key, folder.kind);
          deleted += 1;
        }
      }
    } catch (err) {
      console.error(`쓰이지 않는 업로드 정리 실패: ${folder.prefix}`, err);
      failed += 1;
    }
  }
  return { deleted, failed };
}

/** cleanup: 30일 지난 알림, 만료된 로그인 토큰·카카오 결과 교환 코드 삭제, 탈퇴 회원 파일 다시 지우기, 쓰이지 않는 업로드 지우기 */
export async function runCleanupJob(now = new Date()) {
  const dayAgo = addDays(now, -1);
  const [notifications, refreshTokens, tempTokens, files, orphans] = await Promise.all([
    prisma.notification.deleteMany({ where: { regDate: { lt: addDays(now, -KEEP_DAYS) } } }),
    prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: dayAgo } }, { revokedAt: { lt: dayAgo } }] },
    }),
    prisma.authTemporaryToken.deleteMany({ where: { expiresAt: { lt: dayAgo } } }),
    sweepWithdrawnFiles(now),
    sweepOrphanUploads(now),
  ]);
  return {
    notifications: notifications.count,
    refreshTokens: refreshTokens.count,
    temporaryTokens: tempTokens.count,
    withdrawnFileMembers: files.withdrawnMembers,
    orphanUploads: orphans.deleted,
    // run.ts가 failed > 0이면 종료 코드 1로 알린다
    failed: files.failed + orphans.failed,
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

/** review-ai가 한 번에 분석하는 리뷰 수와 호출 간격 (Gemini 무료 티어의 분당 호출 한도를 넘지 않게) */
export const REVIEW_AI_BATCH = 50;
export const REVIEW_AI_INTERVAL_MS = 4_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * review-ai: 아직 분석하지 않은 공개 리뷰 글을 Gemini로 분석해 ai_result·ai_checked_at·ad_suspected를 채운다.
 * 키가 없으면 건너뛴다. 호출 한도(429)에 걸리면 멈추고 다음 실행에서 이어서 한다.
 * 일시적으로 실패한 리뷰는 ai_checked_at을 비워 둔 채 다음 실행에서 다시 한다.
 * 200인데 답을 읽을 수 없는 리뷰는 다시 해도 같아서 ai_result에 unreadable을 남기고 대기열에서 뺀다
 * (그대로 두면 그런 글이 50개 쌓였을 때 뒤의 리뷰를 영영 분석하지 못한다)
 */
export async function runReviewAiJob(now = new Date(), wait = sleep) {
  if (!reviewAiEnabled()) return { skipped: 'GEMINI_API_KEY가 없어 분석하지 않았어요' };
  const reviews = await prisma.review.findMany({
    where: { status: 'A', content: { not: null }, aiCheckedAt: null },
    orderBy: { id: 'asc' },
    take: REVIEW_AI_BATCH,
    select: { id: true, content: true, imageCount: true },
  });
  let analyzed = 0;
  let adSuspected = 0;
  let errors = 0;
  let unreadable = 0;
  let rateLimited = false;
  for (const [i, review] of reviews.entries()) {
    if (i > 0) await wait(REVIEW_AI_INTERVAL_MS);
    const result = await analyzeReview({
      content: review.content ?? '',
      imageCount: review.imageCount,
    });
    if (result === 'RATE_LIMITED') {
      rateLimited = true;
      break;
    }
    // 키·모델이 틀렸으면 나머지 리뷰도 같은 이유로 실패하니 더 부르지 않고 실패로 끝낸다 (job 종료 코드 1)
    if (result === 'CONFIG_ERROR') {
      throw new Error('Gemini 설정 오류: GEMINI_API_KEY·GEMINI_MODEL을 확인하세요');
    }
    if (!result) {
      errors += 1;
      continue;
    }
    // 분석하는 사이에 글을 고쳤으면 저장하지 않는다 (고친 글은 다음 실행에서 다시 분석)
    const where = { id: review.id, content: review.content, aiCheckedAt: null };
    if (result === 'UNREADABLE') {
      const marked = await prisma.review.updateMany({
        where,
        data: {
          aiResult: { unreadable: true, model: env.GEMINI_MODEL },
          aiCheckedAt: now,
          adSuspected: false,
        },
      });
      unreadable += marked.count;
      continue;
    }
    const saved = await prisma.review.updateMany({
      where,
      data: { aiResult: result, aiCheckedAt: now, adSuspected: result.adSuspected },
    });
    if (saved.count === 0) continue;
    analyzed += 1;
    if (result.adSuspected) adSuspected += 1;
  }
  return { checked: reviews.length, analyzed, adSuspected, errors, unreadable, rateLimited };
}

export const JOBS = {
  rating: runRatingJob,
  season: runSeasonJob,
  cleanup: runCleanupJob,
  'saved-reminder': runSavedReminderJob,
  'review-ai': runReviewAiJob,
  'store-import': runStoreImportJob,
} as const;

export type JobName = keyof typeof JOBS;
