// 프로필·내 동네·내 취향 API (USER-01·03·04·05·09·10, LOCAL-01~03)

import { api } from '../lib/api';
import type { TasteKey } from './restaurants';

export type Gender = 'F' | 'M' | 'N';
export type AgeGroup = 10 | 20 | 30 | 40 | 50;

export const GENDER_LABEL: Record<Gender, string> = { F: '여성', M: '남성', N: '선택 안 함' };
export const AGE_LABEL: Record<AgeGroup, string> = {
  10: '10대',
  20: '20대',
  30: '30대',
  40: '40대',
  50: '50대 이상',
};

export type LocalRegion = {
  localRegionId: number;
  regionId: number;
  dongName: string;
  sigunguId: number;
  sigunguName: string;
  sortOrder: number;
  regDate: string;
};

/** USER-04 내 프로필 (약관 동의 전에도 부를 수 있다) */
export type MyProfile = {
  id: number;
  nickname: string | null;
  /** 닉네임을 다시 바꿀 수 있는 시각 (지금 바꿀 수 있으면 null) */
  nicknameChangeableAt: string | null;
  profileImageUrl: string | null;
  profileImageSource: 'CUSTOM' | 'DEFAULT';
  gender: Gender | null;
  ageGroup: AgeGroup | null;
  status: 'P' | 'A' | 'S';
  localRegions: LocalRegion[];
  regDate: string;
};
export const getMe = () => api.get<MyProfile>('/users/me');

/** USER-01 닉네임 중복 확인 */
export type NicknameAvailability = {
  nickname: string;
  available: boolean;
  reason: null | 'INVALID_LENGTH' | 'INVALID_CHARACTER' | 'DUPLICATE' | 'SAME_AS_CURRENT';
};
export const checkNickname = (nickname: string) =>
  api.call<NicknameAvailability>('GET', '/users/nickname/availability', { query: { nickname } });

/** USER-03 프로필 설정 완료 */
export type Welcome = {
  seasonNo: number | null;
  tierTitle: string;
  mukkaebi: { level: number; stage: string };
  firstGoal: { sigunguName: string; current: number; target: number; nextTierName: string };
};
export const completeProfile = (body: {
  nickname: string;
  profileImageKey?: string | null;
  gender: Gender;
  ageGroup: AgeGroup;
  localRegionIds: number[];
  /** S-05-1 좋아하는 음식 (카테고리 id 1개 이상) */
  preferredCategoryIds: number[];
  /** S-05-2 중요하게 보는 것 (안 보내면 모두 보통) */
  tasteWeights?: TasteWeights;
}) =>
  api.post<{
    nextAction: 'HOME';
    user: { id: number; nickname: string; gender: Gender; ageGroup: AgeGroup };
    localRegions: LocalRegion[];
    preferredCategories: { categoryId: number; categoryName: string }[];
    welcome: Welcome;
  }>('/users/me/profile', body);

/** 닉네임 규칙 (서버와 같다): 한글·영문·숫자 2~10자 */
export const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]{2,10}$/;
export const NICKNAME_MAX = 10;

/** USER-05 프로필 수정 (바꿀 값만 보낸다) */
export const updateProfile = (body: { nickname?: string; gender?: Gender; ageGroup?: AgeGroup }) =>
  api.call<{
    id: number;
    nickname: string;
    nicknameChangeableAt: string | null;
    gender: Gender;
    ageGroup: AgeGroup;
  }>('PATCH', '/users/me', { body });

/** LOCAL-01 내 동네 목록 */
export type LocalRegionList = {
  items: LocalRegion[];
  minCount: number;
  maxCount: number;
  /** 이번 시즌에 아직 바꿀 수 있는지 */
  canChange: boolean;
  /** 다시 바꿀 수 있는 날 (YYYY-MM-DD, 지금 바꿀 수 있으면 null) */
  nextChangeAvailableAt: string | null;
};
export const getLocalRegions = () => api.get<LocalRegionList>('/users/me/local-regions');

/** LOCAL-02 내 동네 추가 (서버 문구 "{구} {동}을 내 동네에 추가했어요."를 토스트로 쓴다) */
export const addLocalRegion = (regionId: number) =>
  api.call<Omit<LocalRegionList, 'minCount' | 'maxCount'> & { added: LocalRegion }>(
    'POST',
    '/users/me/local-regions',
    { body: { regionId } },
  );

/** LOCAL-03 내 동네 빼기 */
export const removeLocalRegion = (localRegionId: number) =>
  api.call<Omit<LocalRegionList, 'minCount' | 'maxCount' | 'added'>>(
    'DELETE',
    `/users/me/local-regions/${localRegionId}`,
  );

/** 내 취향: 항목마다 보통·중요·아주 중요 */
export type WeightLevel = 'NORMAL' | 'IMPORTANT' | 'VERY';
export type TasteWeights = Record<TasteKey, WeightLevel>;

type TasteWeightsView = {
  items: { key: TasteKey; level: WeightLevel; weightPercent: number }[];
};

/** USER-09 내 취향 조회 */
export const getTasteWeights = () => api.get<TasteWeightsView>('/users/me/taste-weights');

/** USER-10 내 취향 저장 (다섯 항목을 한 번에) */
export const saveTasteWeights = (weights: TasteWeights) =>
  api.call<TasteWeightsView>('PUT', '/users/me/taste-weights', { body: weights });

/** USER-08 내 정보 메인 요약 (시즌 기록·메뉴 숫자) */
export type MySummary = {
  nickname: string | null;
  title: string | null;
  homeRegion: string | null;
  trustTemp: number;
  pointBalance: number;
  mukkaebi: { level: number; stage: string; stageName: string };
  season: { seasonNo: number; name: string; daysLeft: number } | null;
  seasonRecord: {
    conquestCount: number;
    reviewCount: number;
    helpfulReceived: number;
    main: {
      sigunguId: number;
      sigunguName: string;
      conquestCount: number;
      rank: number | null;
      tierTitle: string;
      nextTier: { tierName: string; remaining: number } | null;
      mukjjangGap: number;
    } | null;
  };
  newItemCount: number;
  titleCount: number;
  savedRestaurantCount: number;
  pickCount: number;
};
export const getMySummary = () => api.get<MySummary>('/users/me/summary');
