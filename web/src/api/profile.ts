// 탐방러 프로필·내 PICK·신고·차단 API (PROFILE-01·02, PICK-01·02, REPORT-01, BLOCK-01·02)

import { api } from '../lib/api';
import type { MyMukkaebi } from './mukkaebi';
import type { Tier } from './ranking';
import type { Page } from './reviews';

export type VisitedRestaurant = {
  restaurantId: number;
  name: string;
  categoryName: string | null;
  sigunguName: string;
  dongName: string;
  /** 맛 별점 (리뷰를 지웠으면 null) */
  overallScore: number | null;
  reviewId: number | null;
  conqueredAt: string;
};

/** PROFILE-02 다녀온 가게 (시즌별, 최근 정복순) */
export const getVisitedRestaurants = (
  userId: number,
  query: { seasonId?: number; page?: number; size?: number },
) =>
  api.get<Page<VisitedRestaurant> & { seasonId: number | null; isMe: boolean }>(
    `/users/${userId}/visited-restaurants`,
    query,
  );

export type Pick = {
  order: number;
  restaurantId: number;
  name: string;
  categoryName: string | null;
  sigunguName: string;
  dongName: string;
  lat: number;
  lng: number;
  comment: string | null;
  visitCount: number;
};

export type PickCandidate = {
  restaurantId: number;
  name: string;
  categoryName: string | null;
  dongName: string;
  visitCount: number;
  isPicked: boolean;
};

/** PICK-01 내 PICK과 고를 수 있는 정복한 가게 */
export const getMyPicks = (query: { keyword?: string; page?: number; size?: number }) =>
  api.get<{ picks: Pick[]; maxPicks: number; candidates: Page<PickCandidate> }>(
    '/users/me/picks',
    query,
  );

/** PICK-02 내 PICK 저장 (순서대로 통째로) */
export const saveMyPicks = (picks: { restaurantId: number; comment: string | null }[]) =>
  api.call<{ picks: Pick[] }>('PUT', '/users/me/picks', { body: { picks } });

/** PROFILE-01 탐방러 프로필 */
export type MemberProfile = {
  userId: number;
  nickname: string | null;
  profileImageUrl: string | null;
  bio: string | null;
  trustTemp: number;
  /** 대표 칭호 */
  title: string | null;
  /** "강서구 가양동" */
  homeRegion: string | null;
  mukkaebi: {
    level: number;
    exp: number;
    levelExp: number;
    nextLevelExp: number | null;
    stage: MyMukkaebi['stage'];
    stageName: string;
    equipped: MyMukkaebi['equipped'];
    background: MyMukkaebi['background'];
  };
  currentSeason: {
    seasonId: number;
    seasonNo: number;
    conquestCount: number;
    best: {
      sigunguId: number;
      sigunguName: string;
      rank: number | null;
      tier: Tier;
      tierTitle: string;
    } | null;
  } | null;
  totalConquestCount: number;
  helpfulReceived: number;
  seasonTitles: { seasonNo: number; title: string; isCurrent: boolean }[];
  achievements: {
    achievedCount: number;
    totalCount: number;
    recent: {
      achievementId: number;
      name: string;
      description: string | null;
      iconKey: string | null;
      achievedAt: string;
    }[];
  };
  counts: { visitedRestaurants: number; reviews: number; picks: number };
  picks: Pick[];
  isMe: boolean;
  isBlocked: boolean;
};
export const getMemberProfile = (userId: number) =>
  api.get<MemberProfile>(`/users/${userId}/profile`);

/** REPORT-01 신고 사유 (피그마 신고 사유 화면 순서) */
export const REPORT_REASONS = [
  { value: 'SPAM', label: '스팸 · 광고' },
  { value: 'AD', label: '뒷광고 · 리뷰 이벤트 (협찬을 숨긴 리뷰)' },
  { value: 'ABUSE', label: '욕설 · 비방' },
  { value: 'FAKE', label: '가짜 리뷰 (영수증과 다른 내용)' },
  { value: 'PRIVACY', label: '개인정보 노출' },
  { value: 'ETC', label: '기타' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

/** REPORT-01 신고하기 (탐험가 또는 리뷰). 신고한 사실은 상대에게 알리지 않는다 */
export const report = (body: {
  targetType: 'MEMBER' | 'REVIEW';
  targetId: number;
  reason: ReportReason;
  detail: string | null;
}) => api.call<{ reportId: number; status: 'RECEIVED' }>('POST', '/reports', { body });

/** BLOCK-01 차단하기 — 이 탐험가의 리뷰가 보이지 않는다 */
export const blockMember = (userId: number) =>
  api.call<{ userId: number; isBlocked: true }>('PUT', `/users/me/blocks/${userId}`);

/** BLOCK-02 차단 풀기 */
export const unblockMember = (userId: number) =>
  api.call<{ userId: number; isBlocked: false }>('DELETE', `/users/me/blocks/${userId}`);
