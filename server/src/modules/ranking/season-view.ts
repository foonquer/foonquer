import { AppError } from '../../common/errors/app-error';
import { findCurrentSeason } from '../../common/season';
import { formatDbDate, kstTodayAsDbDate } from '../../common/time';
import { prisma } from '../../lib/prisma';
import { RankingError } from './ranking.errors';

const DAY_MS = 86_400_000;
const STATUS_API: Record<string, string> = {
  U: 'UPCOMING',
  A: 'ACTIVE',
  E: 'CLOSING',
  F: 'FINALIZED',
};

export interface SeasonLike {
  id: number;
  seasonNo: number;
  startDate: Date;
  endDate: Date;
  status?: string;
}

/** 시즌 응답 (RANK-01·02 공통). daysLeft = D-n (오늘 포함하지 않는 남은 날, 끝난 시즌은 0) */
export function toSeasonView(season: SeasonLike, now = new Date()) {
  const today = kstTodayAsDbDate(now).getTime();
  return {
    seasonId: season.id,
    seasonNo: season.seasonNo,
    name: `시즌 ${season.seasonNo}`,
    startDate: formatDbDate(season.startDate),
    endDate: formatDbDate(season.endDate),
    status: season.status ? (STATUS_API[season.status] ?? season.status) : 'ACTIVE',
    daysLeft: Math.max(0, Math.round((season.endDate.getTime() - today) / DAY_MS)),
  };
}

/** seasonId가 있으면 그 시즌(예정 시즌은 없음 취급), 없으면 진행 중 시즌 */
export async function resolveSeason(seasonId?: number) {
  if (seasonId) {
    const season = await prisma.season.findUnique({ where: { id: seasonId } });
    if (!season || season.status === 'U') throw new AppError(RankingError.SEASON_NOT_FOUND);
    return season;
  }
  const current = await findCurrentSeason();
  if (!current) throw new AppError(RankingError.NO_ACTIVE_SEASON);
  return { ...current, status: 'A' };
}

export async function findSigungu(sigunguId: number) {
  const sigungu = await prisma.region.findUnique({
    where: { id: sigunguId },
    select: { id: true, name: true, level: true, bgKey: true, centerLat: true, centerLng: true },
  });
  if (!sigungu || sigungu.level !== 2) throw new AppError(RankingError.SIGUNGU_NOT_FOUND);
  return sigungu;
}
