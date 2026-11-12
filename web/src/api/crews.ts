// 모임 API (CREW-01~08, 피그마 12. 모임)

import { api } from '../lib/api';

export type CrewType = 'FRIEND' | 'FAMILY' | 'COUPLE';

export type CrewMember = {
  userId: number;
  nickname: string | null;
  profileImageUrl: string | null;
  hatCode: string | null;
  /** 수락 대기면 INVITED */
  status: 'JOINED' | 'INVITED';
  isMe: boolean;
};

/** 모임 머리 정보 (목록·공간·초대 공통) */
export type CrewHead = {
  crewId: number;
  type: CrewType;
  typeName: string;
  name: string;
  sigunguId: number;
  sigunguName: string;
  /** 참여 중인 모임원 수 */
  memberCount: number;
  maxMembers: number;
  isOwner: boolean;
};

export type CrewQuest = {
  crewQuestId: number;
  type: 'TOGETHER' | 'SPLIT';
  typeName: string;
  title: string;
  summary: string;
  /** 모임원 각자 받는 먹포인트 */
  rewardPoint: number;
  status: 'ACTIVE' | 'DONE';
  target: number;
  progress: number;
  restaurantId: number | null;
  /** 함께 정복할 가게 이름 (나눠 찾기는 null) */
  restaurantName: string | null;
  /** 함께 정복은 같이 정복한 모임원, 나눠 찾기는 1곳씩 채운 모임원 */
  participants: { userId: number; nickname: string | null }[];
};

export type CrewListItem = CrewHead & {
  members: CrewMember[];
  conquestCount: number;
  activeQuestCount: number;
};

export type CrewInvitation = CrewHead & { inviterNickname: string | null };

/** CREW-02 내 모임 + 받은 초대 */
export const getMyCrews = () =>
  api.get<{ crews: CrewListItem[]; invitations: CrewInvitation[] }>('/crews');

export type CrewSpace = CrewHead & {
  inviteCode: string;
  /** 참여 중 + 수락 대기 */
  members: CrewMember[];
  conquestCount: number;
  quests: CrewQuest[];
  /** 함께 정복한 곳 (최근 순). 방문 시각·위치는 오지 않는다 */
  conquests: {
    crewConquestId: number;
    date: string;
    restaurantId: number;
    name: string;
    lat: number;
    lng: number;
    tasteScore: number | null;
    members: { userId: number; nickname: string | null }[];
  }[];
  badges: { code: string; name: string }[];
  /** rewardItem: 그 배지와 함께 모임원 모두 받는 아이템 (단골 모임 → 모임 단체 모자) */
  nextBadge: {
    code: string;
    name: string;
    target: number;
    rewardItem: { code: string; name: string } | null;
  } | null;
};

/** CREW-01 모임 만들기 (동네를 안 보내면 내 동네의 구) */
export const createCrew = (body: { type: CrewType; name: string; sigunguId?: number }) =>
  api.post<CrewSpace>('/crews', body);

/** CREW-03 모임 공간 */
export const getCrew = (crewId: number) => api.get<CrewSpace>(`/crews/${crewId}`);

/** CREW-04 닉네임으로 초대 */
export const inviteToCrew = (crewId: number, nickname: string) =>
  api.post<{ userId: number; nickname: string; status: 'INVITED' }>(`/crews/${crewId}/invites`, {
    nickname,
  });

export type CrewPreview = CrewHead & {
  members: CrewMember[];
  /** 이미 들어와 있거나 초대 받았으면 */
  myStatus: 'JOINED' | 'INVITED' | null;
};

/** CREW-05 초대 코드로 미리 보기·참여 */
export const previewCrewByCode = (code: string) =>
  api.get<CrewPreview>(`/crews/join/${encodeURIComponent(code)}`);
export const joinCrewByCode = (code: string) =>
  api.post<CrewSpace>(`/crews/join/${encodeURIComponent(code)}`);

/** CREW-06 받은 초대 보기·수락·거절 */
export const getCrewInvitation = (crewId: number) =>
  api.get<CrewInvitation & { members: CrewMember[] }>(`/crews/${crewId}/invitation`);
export const respondCrewInvitation = (crewId: number, accept: boolean) =>
  api.post<CrewSpace | null>(`/crews/${crewId}/invitation`, { accept });

/** CREW-07 모임 나가기 */
export const leaveCrew = (crewId: number) => api.delete<null>(`/crews/${crewId}/members/me`);

/** CREW-08 퀘스트 시트 모임 퀘스트 탭 */
export const getCrewQuests = () =>
  api.get<{ items: (CrewHead & { members: CrewMember[]; quests: CrewQuest[] })[] }>(
    '/crews/quests',
  );

/** 별점 등록(REVIEW-01) 결과: 모임원과 함께 정복한 모임들 */
export type CrewTogether = {
  crewId: number;
  crewName: string;
  partners: string[];
  restaurantName: string;
  conquestCount: number;
  badges: string[];
  /** 배지와 함께 받은 아이템 (단골 모임 → 모임 단체 모자) */
  rewardItems: { itemId: number; code: string; name: string }[];
  rewardPoint: number;
};
