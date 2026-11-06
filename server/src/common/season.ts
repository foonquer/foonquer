import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * 진행 중인 시즌 (명세서 "값 규칙": season.status = A). 없으면 null.
 * 시즌을 만들고 바꾸는 일은 시즌·랭킹 쪽에서 하고, 여기서는 읽기만 한다.
 */
export function findCurrentSeason(db: Db = prisma) {
  return db.season.findFirst({
    where: { status: 'A' },
    orderBy: { startDate: 'desc' },
    select: { id: true, seasonNo: true, startDate: true, endDate: true },
  });
}

export type CurrentSeason = NonNullable<Awaited<ReturnType<typeof findCurrentSeason>>>;
