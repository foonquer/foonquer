// 시즌·랭킹·칭호 API (RANK-01~11)

import { api } from '../lib/api';
import type { Page } from './reviews';

export type Season = {
  seasonId: number;
  seasonNo: number;
  name: string;
  startDate: string;
  endDate: string;
  status: 'UPCOMING' | 'ACTIVE' | 'CLOSING' | 'FINALIZED';
  daysLeft: number;
};

export type Tier = 'BEGINNER' | 'REGULAR' | 'GOURMET' | 'CONQUEROR' | 'MUKJJANG';

export const TIER_NAME: Record<Tier, string> = {
  BEGINNER: '초보 탐방러',
  REGULAR: '단골',
  GOURMET: '미식가',
  CONQUEROR: '정복자',
  MUKJJANG: '먹짱',
};

type TierView = {
  tier: Tier;
  tierName: string;
  tierTitle: string;
  nextTier: { tier: Tier; tierName: string; remaining: number } | null;
};

/** RANK-02 시즌 목록 (최신순) */
export const getSeasons = () => api.get<{ items: Season[] }>('/seasons');

export type MySigungu = TierView & {
  sigunguId: number;
  sigunguName: string;
  isLocal: boolean;
  conquestCount: number;
  rank: number | null;
  topPercent: number | null;
  activeExplorerCount: number;
};

/** RANK-03 내 구별 정복 현황 (내 동네 구가 맨 앞) */
export const getMySigungus = (seasonId?: number) =>
  api.get<{
    season: Season;
    totalConquestCount: number;
    sigunguCount: number;
    items: MySigungu[];
  }>('/users/me/conquests/sigungus', { seasonId });

export type RankingRow = {
  rank: number;
  userId: number | null;
  nickname: string | null;
  conquestCount: number;
  tier: Tier;
  isMe: boolean;
};

/** RANK-04 구 상세 현황 */
export const getMySigunguDetail = (
  sigunguId: number,
  query: { seasonId?: number; page?: number },
) =>
  api.get<
    TierView & {
      season: Season;
      sigunguId: number;
      sigunguName: string;
      conquestCount: number;
      rank: number | null;
      topPercent: number | null;
      activeExplorerCount: number;
      tierProgress: { current: number; nextTierAt: number | null; nextTierName: string | null };
      mukjjangGap: number;
      rankingPreview: RankingRow[];
      restaurants: Page<{
        restaurantId: number;
        name: string;
        categoryName: string | null;
        conqueredAt: string;
      }>;
    }
  >(`/users/me/conquests/sigungus/${sigunguId}`, { ...query, size: 20 });

/** RANK-05 구 랭킹 TOP 50 + 내 순위 + TOP 3의 PICK */
export const getSigunguRanking = (sigunguId: number, seasonId?: number) =>
  api.get<{
    season: Season;
    sigunguId: number;
    sigunguName: string;
    activeExplorerCount: number;
    items: (RankingRow & {
      profileImageUrl: string | null;
      mukkaebi: { level: number; hatCode: string | null };
      tierName: string;
    })[];
    myRank: {
      rank: number;
      conquestCount: number;
      topPercent: number | null;
      tier: Tier;
      mukjjangGap: number;
    } | null;
    topPicks: {
      rank: number;
      userId: number | null;
      nickname: string | null;
      pickCount: number;
      restaurants: { restaurantId: number; name: string }[];
    }[];
  }>(`/rankings/sigungus/${sigunguId}`, { seasonId });

export type MukjjangSigungu = {
  sigunguId: number;
  name: string;
  centerLat: number | null;
  centerLng: number | null;
  mukjjang: {
    userId: number;
    nickname: string | null;
    profileImageUrl: string | null;
    level: number;
    conquestCount: number;
    isMe: boolean;
  } | null;
  myRank: number | null;
  myConquestCount: number;
  mukjjangGap: number;
};

/** RANK-06 먹짱 지도 (구별 1위) */
export const getMukjjangMap = (seasonId?: number) =>
  api.get<{ season: Season; level: 'SIGUNGU'; items: MukjjangSigungu[] }>(
    '/rankings/mukjjang-map',
    { seasonId },
  );

export type Achievement = {
  achievementId: number;
  code: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  rewardPoint: number;
  achieved: boolean;
  achievedAt: string | null;
  progress: { current: number; target: number };
};

/** RANK-08 업적 목록과 진행도 */
export const getAchievements = () =>
  api.get<{
    achievedCount: number;
    totalCount: number;
    representativeTitle: string | null;
    items: Achievement[];
  }>('/users/me/achievements');

export type OwnedTitle = {
  type: 'TIER' | 'ACHIEVEMENT';
  refId: number;
  title: string;
  seasonNo: number | null;
  isCurrent: boolean;
  isRepresentative: boolean;
};

/** RANK-11 보유 칭호 */
export const getTitles = () =>
  api.get<{
    representativeTitle: string | null;
    isAuto: boolean;
    totalCount: number;
    items: OwnedTitle[];
  }>('/users/me/titles');

/** RANK-09 대표 칭호 (null이면 자동: 이번 시즌 가장 높은 티어) */
export const setRepresentativeTitle = (
  title: { type: 'TIER' | 'ACHIEVEMENT'; refId: number } | null,
) =>
  api.patch<{ representativeTitle: string | null; isAuto: boolean }>(
    '/users/me/representative-title',
    title ?? { type: null },
  );

/** RANK-10 시즌 기록 */
export const getSeasonRecords = () =>
  api.get<{
    current: {
      season: Season;
      conquestCount: number;
      sigunguCount: number;
      best: (TierView & { sigunguId: number; sigunguName: string; rank: number | null }) | null;
    } | null;
    records: {
      season: Season;
      bestSigunguId: number;
      bestSigunguName: string;
      tier: Tier;
      tierTitle: string;
      rank: number | null;
      topPercent: number | null;
      conquestTotal: number;
      rewardPoint: number;
      rewardClubItem: { itemId: number; code: string; name: string } | null;
    }[];
  }>('/users/me/season-records');
