import { AppError } from '../../common/errors/app-error';
import { isUniqueViolation } from '../../common/db';
import { toPageResult } from '../../common/pagination';
import { toKstIso } from '../../common/time';
import { publicImageUrl } from '../../lib/image-url';
import { prisma } from '../../lib/prisma';
import { UserError } from '../user/user.errors';
import type { BlockListQuery, ReportBody } from './profile.schema';
import { ProfileError } from './profile.errors';

/** REPORT-01 신고하기 — 신고한 사실은 상대에게 알리지 않는다. 처리는 운영자가 한다 */
export async function createReport(userId: bigint, body: ReportBody, now = new Date()) {
  const targetId = BigInt(body.targetId);
  let ownerId: bigint;
  if (body.targetType === 'REVIEW') {
    const review = await prisma.review.findUnique({
      where: { id: targetId },
      select: { userId: true, status: true },
    });
    if (!review || review.status === 'D') throw new AppError(ProfileError.REPORT_TARGET_NOT_FOUND);
    ownerId = review.userId;
  } else {
    const member = await prisma.member.findUnique({
      where: { id: targetId },
      select: { id: true, status: true },
    });
    if (!member || member.status === 'D') throw new AppError(ProfileError.REPORT_TARGET_NOT_FOUND);
    ownerId = member.id;
  }
  if (ownerId === userId) throw new AppError(ProfileError.CANNOT_REPORT_SELF);
  try {
    const report = await prisma.report.create({
      data: {
        reporterId: userId,
        targetType: body.targetType === 'REVIEW' ? 'R' : 'M',
        targetId,
        reason: body.reason,
        detail: body.detail || null,
        regDate: now,
      },
    });
    return { reportId: report.id, status: 'RECEIVED' };
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(ProfileError.ALREADY_REPORTED);
    throw err;
  }
}

/** BLOCK-01 차단하기 (멱등) */
export async function blockMember(userId: bigint, targetUserId: number, now = new Date()) {
  const blockedId = BigInt(targetUserId);
  if (blockedId === userId) throw new AppError(ProfileError.CANNOT_BLOCK_SELF);
  const target = await prisma.member.findUnique({
    where: { id: blockedId },
    select: { status: true },
  });
  if (!target || target.status === 'D' || target.status === 'P')
    throw new AppError(UserError.MEMBER_NOT_FOUND);
  const row = await prisma.memberBlock.upsert({
    where: { blockerId_blockedId: { blockerId: userId, blockedId } },
    update: {},
    create: { blockerId: userId, blockedId, regDate: now },
  });
  return { userId: blockedId, isBlocked: true, blockedAt: toKstIso(row.regDate) };
}

/** BLOCK-02 차단 해제 (멱등) */
export async function unblockMember(userId: bigint, targetUserId: number) {
  const blockedId = BigInt(targetUserId);
  await prisma.memberBlock.deleteMany({ where: { blockerId: userId, blockedId } });
  return { userId: blockedId, isBlocked: false };
}

/** BLOCK-03 차단한 탐험가 목록 (최근 차단한 순) */
export async function listBlocks(userId: bigint, query: BlockListQuery) {
  const where = { blockerId: userId, blocked: { status: { not: 'D' } } };
  const [rows, totalCount] = await Promise.all([
    prisma.memberBlock.findMany({
      where,
      orderBy: { regDate: 'desc' },
      skip: (query.page - 1) * query.size,
      take: query.size,
      include: { blocked: { select: { id: true, nickname: true, profileImageKey: true } } },
    }),
    prisma.memberBlock.count({ where }),
  ]);
  const items = rows.map((r) => ({
    userId: r.blocked.id,
    nickname: r.blocked.nickname,
    profileImageUrl: publicImageUrl(r.blocked.profileImageKey),
    blockedAt: toKstIso(r.regDate),
  }));
  return toPageResult(items, { ...query, totalCount });
}
