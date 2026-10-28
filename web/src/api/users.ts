// 프로필·내 동네 API (USER-01·03·04·05, LOCAL-01~03)

import { api } from '../lib/api';

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

export type LoginMethod = 'EMAIL' | 'KAKAO' | 'GOOGLE';

export const LOGIN_METHOD_LABEL: Record<LoginMethod, string> = {
  EMAIL: '이메일',
  KAKAO: '카카오',
  GOOGLE: '구글',
};

/** USER-04 내 프로필 (약관 동의 전에도 부를 수 있다) */
export type MyProfile = {
  id: number;
  email: string | null;
  loginMethods: LoginMethod[];
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
}) =>
  api.post<{
    nextAction: 'HOME';
    user: { id: number; nickname: string; gender: Gender; ageGroup: AgeGroup };
    localRegions: LocalRegion[];
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

/** SET-05 비밀번호 변경. 다른 기기는 로그아웃되고 이 기기는 새 토큰을 받는다 */
export const changePassword = (body: {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
}) =>
  api.call<{ accessToken: string; accessTokenExpiresIn: number; passwordChangedAt: string }>(
    'PATCH',
    '/users/me/password',
    { body },
  );
