// 방문 인증 API (VISIT-01~05)

import { api } from '../lib/api';
import type { Coords } from './restaurants';
import type { LevelUp } from './reviews';

export type VerificationStatus =
  | 'READING' // 영수증 읽는 중
  | 'RESTAURANT_CHECK' // 홈 영수증: "이 가게가 맞나요?"
  | 'LOCATION_CHECKED' // 현장인증 위치 확인까지
  | 'VERIFIED' // 인증 완료 (별점을 남기면 정복)
  | 'CONQUERED'
  | 'FAILED';

export type FailReason =
  | 'UNREADABLE'
  | 'DUPLICATE'
  | 'ALREADY_VERIFIED'
  | 'STORE_NOT_FOUND'
  | 'STORE_MISMATCH'
  | 'EXPIRED'
  | 'TOO_FAR'
  | 'PHOTO_UNCLEAR'
  | 'PHOTO_MISMATCH';

export type VisitReward = { point: number; levelUp: LevelUp | null };

/** VISIT-01 현장 위치 확인 (100m 안이면 위치 확인 기록을 만든다) */
export const checkLocation = (body: {
  restaurantId: number;
  lat: number;
  lng: number;
  accuracyM?: number;
}) =>
  api.post<{
    verificationId: number;
    restaurantId: number;
    distanceM: number;
    allowedM: number;
    expiresAt: string;
  }>('/visit-verifications/location-checks', body);

/** VISIT-02 현장 사진 인증 */
export const completeOnSite = (
  verificationId: number,
  body: { sitePhotoKey: string; photoTakenAt?: string; photoLat?: number; photoLng?: number },
) =>
  api.post<{
    verificationId: number;
    status: 'VERIFIED';
    restaurant: { restaurantId: number; name: string };
    reward: VisitReward;
  }>(`/visit-verifications/${verificationId}/on-site`, body);

/** VISIT-03 영수증 인증 요청. restaurantId가 없으면 홈에서 찍은 영수증 (결과는 VISIT-04) */
export const submitReceipt = (body: { restaurantId?: number; receiptImageKey: string }) =>
  api.post<{ verificationId: number; status: VerificationStatus }>(
    '/visit-verifications/receipt',
    body,
  );

export type ReceiptCandidate = {
  restaurantId: number;
  name: string;
  categoryName: string | null;
  roadAddress: string | null;
  distanceM: number | null;
  matchedBy: 'BUSINESS_NO' | 'NAME';
};

export type Verification = {
  verificationId: number;
  method: 'RECEIPT' | 'ON_SITE';
  status: VerificationStatus;
  failReason: FailReason | null;
  failMessage: string | null;
  restaurant: { restaurantId: number; name: string; categoryName: string | null } | null;
  receipt: {
    storeName: string | null;
    paidAt: string | null;
    totalAmount: number | null;
    storeNameMatched: boolean | null;
    businessNoMatched: boolean | null;
    items: { menuName: string; quantity: number | null; price: number | null }[];
  } | null;
  onSite: { distanceM: number | null; allowedM: number; checkedAt: string | null } | null;
  receiptImageUrl: string | null;
  sitePhotoUrl: string | null;
  isLocal: boolean;
  verifiedAt: string | null;
  expiresAt: string | null;
  isExpired: boolean;
  /** 가게 확인 대기(RESTAURANT_CHECK)일 때 후보 가게 (가까운 순) */
  candidates: ReceiptCandidate[] | null;
  /** 별점을 남길 수 있는지 (VERIFIED) */
  canRate: boolean;
  reviewId: number | null;
};

/** VISIT-04 방문 인증 결과 */
export const getVerification = (verificationId: number, coords?: Coords | null) =>
  api.get<Verification>(`/visit-verifications/${verificationId}`, coords ?? undefined);

/** VISIT-05 홈 영수증 "이 가게가 맞나요?"에서 가게 고르기 */
export const confirmReceiptRestaurant = (verificationId: number, restaurantId: number) =>
  api.post<{
    verificationId: number;
    status: VerificationStatus;
    failReason: FailReason | null;
    failMessage: string | null;
    restaurant: { restaurantId: number; name: string } | null;
    reward: VisitReward | null;
  }>(`/visit-verifications/${verificationId}/restaurant`, { restaurantId });
