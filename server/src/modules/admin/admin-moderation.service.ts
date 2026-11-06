import { MemberStatus } from '../../common/auth/member-status';
import type { Tx } from '../../common/db';
import { AppError } from '../../common/errors/app-error';
import { toPageResult } from '../../common/pagination';
import { toKstIso, toKstIsoOrNull } from '../../common/time';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { RestaurantError } from '../restaurant/restaurant.errors';
import { refreshRestaurantStat } from '../restaurant/restaurant-stat-calc';
import { ReviewError } from '../review/review.errors';
import { changeTrustTemp } from '../review/trust-temp';
import { UserError } from '../user/user.errors';
import { AdminError } from './admin.errors';
import type {
  MapaeBody,
  MapaeListQuery,
  MapaeReleaseBody,
  MemberListQuery,
  MemberStatusBody,
  ReportActionBody,
  ReportListQuery,
  ReviewListQuery,
  ReviewStatusBody,
} from './admin.schema';

// ADMIN-01~07·15·16 신고 처리, 리뷰 블라인드·허위 판정, 마패, 회원 이용 정지

const REPORT_STATUS = { PENDING: 'P', DONE: 'A', REJECTED: 'R' } as const;
const REPORT_STATUS_API: Record<string, string> = { P: 'PENDING', A: 'DONE', R: 'REJECTED' };
const REVIEW_STATUS = { VISIBLE: 'A', HIDDEN: 'H', FAKE: 'F' } as const;
const REVIEW_STATUS_API: Record<string, string> = {
  A: 'VISIBLE',
  H: 'HIDDEN',
  F: 'FAKE',
  D: 'DELETED',
};
const MEMBER_STATUS_API: Record<string, string> = {
  P: 'PENDING',
  A: 'ACTIVE',
  S: 'SUSPENDED',
  D: 'WITHDRAWN',
};
const MAPAE_REASON = { AD: 'A', EVENT: 'E' } as const;
const MAPAE_REASON_API: Record<string, string> = { A: 'AD', E: 'EVENT' };

const page = (q: { page: number; size: number }) => ({ skip: (q.page - 1) * q.size, take: q.size });

/** 대상별 아직 처리하지 않은 신고 수 */
async function pendingReportCounts(targetType: 'R' | 'M', targetIds: bigint[]) {
  if (targetIds.length === 0) return new Map<bigint, number>();
  const rows = await prisma.report.groupBy({
    by: ['targetId'],
    where: { targetType, targetId: { in: targetIds }, status: 'P' },
    _count: true,
  });
  return new Map(rows.map((r) => [r.targetId, r._count]));
}

/** ADMIN-01 신고 목록 (오래된 순 — 먼저 들어온 신고부터 처리) */
export async function listReports(query: ReportListQuery) {
  const where: Prisma.ReportWhereInput = {
    status: REPORT_STATUS[query.status],
    targetType: query.targetType ? (query.targetType === 'REVIEW' ? 'R' : 'M') : undefined,
  };
  const [rows, totalCount] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { id: 'asc' },
      ...page(query),
      include: { reporter: { select: { id: true, nickname: true } } },
    }),
    prisma.report.count({ where }),
  ]);
  const reviewIds = rows.filter((r) => r.targetType === 'R').map((r) => r.targetId);
  const memberIds = rows.filter((r) => r.targetType === 'M').map((r) => r.targetId);
  const [reviews, members, reviewCounts, memberCounts] = await Promise.all([
    prisma.review.findMany({
      where: { id: { in: reviewIds } },
      include: {
        user: { select: { id: true, nickname: true } },
        restaurant: { select: { id: true, name: true } },
      },
    }),
    prisma.member.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, nickname: true, status: true, trustTemp: true },
    }),
    pendingReportCounts('R', reviewIds),
    pendingReportCounts('M', memberIds),
  ]);
  const reviewOf = new Map(reviews.map((r) => [r.id, r]));
  const memberOf = new Map(members.map((m) => [m.id, m]));
  const items = rows.map((r) => {
    const review = r.targetType === 'R' ? reviewOf.get(r.targetId) : undefined;
    const member = r.targetType === 'M' ? memberOf.get(r.targetId) : undefined;
    return {
      reportId: r.id,
      targetType: r.targetType === 'R' ? 'REVIEW' : 'MEMBER',
      targetId: r.targetId,
      reason: r.reason,
      detail: r.detail,
      status: REPORT_STATUS_API[r.status],
      regDate: toKstIso(r.regDate),
      processedAt: toKstIsoOrNull(r.processedAt),
      reporter: { userId: r.reporter.id, nickname: r.reporter.nickname },
      // 같은 대상에 쌓인 처리 전 신고 수 (이 신고 포함)
      pendingCount: (r.targetType === 'R' ? reviewCounts : memberCounts).get(r.targetId) ?? 0,
      review: review
        ? {
            reviewId: review.id,
            status: REVIEW_STATUS_API[review.status],
            overallScore: review.overallScore.toNumber(),
            content: review.content,
            author: { userId: review.user.id, nickname: review.user.nickname },
            restaurant: { restaurantId: review.restaurant.id, name: review.restaurant.name },
          }
        : null,
      member: member
        ? {
            userId: member.id,
            nickname: member.nickname,
            status: MEMBER_STATUS_API[member.status],
            trustTemp: member.trustTemp.toNumber(),
          }
        : null,
    };
  });
  return toPageResult(items, { ...query, totalCount });
}

/**
 * 리뷰 상태를 바꾸고 가게 별점을 다시 계산한다. 허위 판정(F)이면 작성자 온도 −5°(리뷰당 한 번).
 * 작성자가 지운 리뷰(D)는 바꿀 수 없다
 */
async function setReviewStatus(tx: Tx, reviewId: bigint, status: 'A' | 'H' | 'F', now: Date) {
  const [locked] = await tx.$queryRaw<{ status: string }[]>`
    SELECT status FROM review WHERE id = ${reviewId} FOR UPDATE`;
  if (!locked) throw new AppError(ReviewError.REVIEW_NOT_FOUND);
  if (locked.status === 'D') throw new AppError(AdminError.INVALID_REVIEW_STATUS);
  const review = await tx.review.update({ where: { id: reviewId }, data: { status } });
  if (status === 'F')
    await changeTrustTemp(
      tx,
      review.userId,
      'FAKE_REVIEW',
      { type: 'REVIEW', id: reviewId },
      null,
      now,
    );
  await refreshRestaurantStat(tx, review.restaurantId, now);
  return review;
}

/** 이용 정지 (활성 → 정지). 이미 정지면 그대로. 정지하면 모든 API가 403 MEMBER_SUSPENDED */
async function suspendMember(tx: Tx, userId: bigint) {
  const member = await tx.member.findUnique({ where: { id: userId }, select: { status: true } });
  if (!member) throw new AppError(UserError.MEMBER_NOT_FOUND);
  if (member.status === MemberStatus.SUSPENDED) return;
  if (member.status !== MemberStatus.ACTIVE) throw new AppError(AdminError.INVALID_MEMBER_STATUS);
  await tx.member.update({ where: { id: userId }, data: { status: MemberStatus.SUSPENDED } });
}

/**
 * ADMIN-02 신고 처리. 조치하면 같은 대상의 처리 전 신고도 함께 끝낸다(조치 완료).
 * - HIDE_REVIEW: 리뷰 블라인드 + 작성자 온도 −3°(신고 확정)
 * - FAKE_REVIEW: 리뷰 허위 판정 + 작성자 온도 −5°
 * - SUSPEND_MEMBER: 신고된 회원 이용 정지 + 온도 −3°(신고 확정)
 * - REJECT: 이 신고만 반려
 */
export async function processReport(reportId: number, body: ReportActionBody, now = new Date()) {
  const id = BigInt(reportId);
  return prisma.$transaction(async (tx) => {
    const target = await tx.report.findUnique({
      where: { id },
      select: { targetType: true, targetId: true },
    });
    if (!target) throw new AppError(AdminError.REPORT_NOT_FOUND);
    // 같은 대상의 신고를 id 순으로 한꺼번에 잠근다 — 두 운영자가 같은 대상의 다른 신고를 동시에 처리해도 교착되지 않고 한쪽만 처리된다
    const locked = await tx.$queryRaw<{ id: bigint; status: string }[]>`
      SELECT id, status FROM report WHERE target_type = ${target.targetType} AND target_id = ${target.targetId}
      ORDER BY id FOR UPDATE`;
    const report = {
      status: locked.find((r) => r.id === id)?.status,
      target_type: target.targetType,
      target_id: target.targetId,
    };
    if (report.status !== 'P') throw new AppError(AdminError.REPORT_ALREADY_PROCESSED);
    if (body.action === 'REJECT') {
      await tx.report.update({ where: { id }, data: { status: 'R', processedAt: now } });
      return { reportId: id, status: REPORT_STATUS_API.R, closedCount: 1 };
    }
    const isReview = report.target_type === 'R';
    if (isReview !== (body.action !== 'SUSPEND_MEMBER'))
      throw new AppError(AdminError.INVALID_REPORT_ACTION);

    if (isReview) {
      const review = await setReviewStatus(
        tx,
        report.target_id,
        body.action === 'HIDE_REVIEW' ? 'H' : 'F',
        now,
      );
      if (body.action === 'HIDE_REVIEW')
        await changeTrustTemp(
          tx,
          review.userId,
          'REPORT_CONFIRMED',
          { type: 'REPORT', id },
          null,
          now,
        );
    } else {
      await suspendMember(tx, report.target_id);
      await changeTrustTemp(
        tx,
        report.target_id,
        'REPORT_CONFIRMED',
        { type: 'REPORT', id },
        null,
        now,
      );
    }
    const { count } = await tx.report.updateMany({
      where: { targetType: report.target_type, targetId: report.target_id, status: 'P' },
      data: { status: 'A', processedAt: now },
    });
    return { reportId: id, status: REPORT_STATUS_API.A, closedCount: count };
  });
}

/** ADMIN-03 리뷰 목록 (최신순). 신고 수·AI 협찬 의심을 같이 보여 준다 */
export async function listReviews(query: ReviewListQuery) {
  const where: Prisma.ReviewWhereInput = {
    status: query.status ? REVIEW_STATUS[query.status] : { not: 'D' },
    adSuspected: query.adSuspected,
  };
  const [rows, totalCount] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { id: 'desc' },
      ...page(query),
      include: {
        user: { select: { id: true, nickname: true, trustTemp: true } },
        restaurant: { select: { id: true, name: true, hasMapae: true } },
      },
    }),
    prisma.review.count({ where }),
  ]);
  const reports = await pendingReportCounts(
    'R',
    rows.map((r) => r.id),
  );
  const items = rows.map((r) => ({
    reviewId: r.id,
    status: REVIEW_STATUS_API[r.status],
    overallScore: r.overallScore.toNumber(),
    content: r.content,
    imageCount: r.imageCount,
    adSuspected: r.adSuspected,
    pendingReportCount: reports.get(r.id) ?? 0,
    regDate: toKstIso(r.regDate),
    author: {
      userId: r.user.id,
      nickname: r.user.nickname,
      trustTemp: r.user.trustTemp.toNumber(),
    },
    restaurant: {
      restaurantId: r.restaurant.id,
      name: r.restaurant.name,
      hasMapae: r.restaurant.hasMapae,
    },
  }));
  return toPageResult(items, { ...query, totalCount });
}

/** ADMIN-04 리뷰 블라인드·허위 판정·되돌리기 (되돌려도 이미 내린 온도는 그대로) */
export async function changeReviewStatus(
  reviewId: number,
  body: ReviewStatusBody,
  now = new Date(),
) {
  const review = await prisma.$transaction((tx) =>
    setReviewStatus(tx, BigInt(reviewId), REVIEW_STATUS[body.status], now),
  );
  return { reviewId: review.id, status: REVIEW_STATUS_API[review.status] };
}

/** ADMIN-05 마패 목록 */
export async function listMapae(query: MapaeListQuery) {
  const where = { status: query.status === 'ACTIVE' ? 'A' : 'R' };
  const [rows, totalCount] = await Promise.all([
    prisma.restaurantMapae.findMany({
      where,
      orderBy: { id: 'desc' },
      ...page(query),
      include: { restaurant: { select: { id: true, name: true } } },
    }),
    prisma.restaurantMapae.count({ where }),
  ]);
  const items = rows.map((m) => ({
    mapaeId: m.id,
    restaurant: { restaurantId: m.restaurant.id, name: m.restaurant.name },
    reason: MAPAE_REASON_API[m.reason],
    evidence: m.evidence,
    reportId: m.reportId,
    reviewId: m.reviewId,
    status: m.status === 'A' ? 'ACTIVE' : 'RELEASED',
    grantedBy: m.grantedBy,
    grantedAt: toKstIso(m.grantedAt),
    releasedAt: toKstIsoOrNull(m.releasedAt),
    releaseReason: m.releaseReason,
  }));
  return toPageResult(items, { ...query, totalCount });
}

/** ADMIN-06 마패 붙이기 — 가게마다 표시 중인 마패는 하나. restaurant.has_mapae도 같이 바꾼다 */
export async function grantMapae(adminId: bigint, body: MapaeBody, now = new Date()) {
  const restaurantId = BigInt(body.restaurantId);
  const mapae = await prisma.$transaction(async (tx) => {
    const [restaurant] = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM restaurant WHERE id = ${restaurantId} FOR UPDATE`;
    if (!restaurant) throw new AppError(RestaurantError.RESTAURANT_NOT_FOUND);
    if (body.reportId) {
      const report = await tx.report.findUnique({ where: { id: BigInt(body.reportId) } });
      if (!report) throw new AppError(AdminError.REPORT_NOT_FOUND);
    }
    if (body.reviewId) {
      const review = await tx.review.findUnique({ where: { id: BigInt(body.reviewId) } });
      if (review?.restaurantId !== restaurantId) throw new AppError(ReviewError.REVIEW_NOT_FOUND);
    }
    const active = await tx.restaurantMapae.count({ where: { restaurantId, status: 'A' } });
    if (active > 0) throw new AppError(AdminError.MAPAE_ALREADY_ACTIVE);
    const created = await tx.restaurantMapae.create({
      data: {
        restaurantId,
        reason: MAPAE_REASON[body.reason],
        evidence: body.evidence ?? null,
        reportId: body.reportId ? BigInt(body.reportId) : null,
        reviewId: body.reviewId ? BigInt(body.reviewId) : null,
        grantedBy: `member:${adminId.toString()}`,
        grantedAt: now,
        regDate: now,
      },
    });
    await tx.restaurant.update({ where: { id: restaurantId }, data: { hasMapae: true } });
    return created;
  });
  return {
    mapaeId: mapae.id,
    restaurantId,
    status: 'ACTIVE',
    grantedAt: toKstIso(mapae.grantedAt),
  };
}

/** ADMIN-07 마패 해제 (행은 이력으로 남긴다) */
export async function releaseMapae(mapaeId: number, body: MapaeReleaseBody, now = new Date()) {
  const id = BigInt(mapaeId);
  const mapae = await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ status: string; restaurant_id: bigint }[]>`
      SELECT status, restaurant_id FROM restaurant_mapae WHERE id = ${id} FOR UPDATE`;
    if (!locked) throw new AppError(AdminError.MAPAE_NOT_FOUND);
    if (locked.status !== 'A') throw new AppError(AdminError.MAPAE_ALREADY_RELEASED);
    const released = await tx.restaurantMapae.update({
      where: { id },
      data: { status: 'R', releasedAt: now, releaseReason: body.releaseReason },
    });
    await tx.restaurant.update({ where: { id: locked.restaurant_id }, data: { hasMapae: false } });
    return released;
  });
  return { mapaeId: mapae.id, status: 'RELEASED', releasedAt: toKstIsoOrNull(mapae.releasedAt) };
}

/** ADMIN-15 회원 찾기 (닉네임 일부, 최근 가입 순) */
export async function listMembers(query: MemberListQuery) {
  const status = query.status
    ? Object.entries(MEMBER_STATUS_API).find(([, api]) => api === query.status)?.[0]
    : undefined;
  const where: Prisma.MemberWhereInput = {
    status,
    nickname: query.nickname ? { contains: query.nickname } : undefined,
  };
  const [rows, totalCount] = await Promise.all([
    prisma.member.findMany({ where, orderBy: { id: 'desc' }, ...page(query) }),
    prisma.member.count({ where }),
  ]);
  const reports = await pendingReportCounts(
    'M',
    rows.map((m) => m.id),
  );
  const items = rows.map((m) => ({
    userId: m.id,
    nickname: m.nickname,
    status: MEMBER_STATUS_API[m.status],
    role: m.role === 'A' ? 'ADMIN' : 'USER',
    trustTemp: m.trustTemp.toNumber(),
    pendingReportCount: reports.get(m.id) ?? 0,
    regDate: toKstIso(m.regDate),
    lastLoginAt: toKstIsoOrNull(m.lastLoginAt),
  }));
  return toPageResult(items, { ...query, totalCount });
}

/** ADMIN-16 이용 정지·해제 (활성 ↔ 정지만) */
export async function changeMemberStatus(adminId: bigint, userId: number, body: MemberStatusBody) {
  const id = BigInt(userId);
  if (id === adminId && body.status === 'SUSPENDED')
    throw new AppError(AdminError.CANNOT_SUSPEND_SELF);
  await prisma.$transaction(async (tx) => {
    if (body.status === 'SUSPENDED') return suspendMember(tx, id);
    const member = await tx.member.findUnique({ where: { id }, select: { status: true } });
    if (!member) throw new AppError(UserError.MEMBER_NOT_FOUND);
    if (member.status === MemberStatus.ACTIVE) return;
    if (member.status !== MemberStatus.SUSPENDED)
      throw new AppError(AdminError.INVALID_MEMBER_STATUS);
    await tx.member.update({ where: { id }, data: { status: MemberStatus.ACTIVE } });
  });
  return { userId: id, status: body.status };
}
