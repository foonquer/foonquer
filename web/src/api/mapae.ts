// 마패 제보·사장님 이의제기 API (MAPAE-01~03)

import { api } from '../lib/api';

export type MapaeEventType = 'STAR5' | 'SERVICE' | 'RECEIPT' | 'ETC';
export const MAPAE_EVENT_TYPES: { value: MapaeEventType; label: string }[] = [
  { value: 'STAR5', label: '별점 5점 조건' },
  { value: 'SERVICE', label: '리뷰 쓰면 서비스' },
  { value: 'RECEIPT', label: '영수증 리뷰 유도' },
  { value: 'ETC', label: '기타' },
];

export type MapaeReport = {
  reportId: number;
  restaurantId: number;
  restaurantName: string;
  eventType: MapaeEventType;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  /** 제보한 자리와 가게 사이 거리 (m) */
  distanceM: number;
  hasVisit: boolean;
  /** 지금까지 제보한 서로 다른 방문자 수 */
  reporterCount: number;
  /** 마패가 붙는 제보자 수 (2) */
  reportersNeeded: number;
  /** 마패가 확정돼 받은 포인트 (아직이면 0) */
  rewardPoint: number;
  regDate: string;
};

/** 마패가 확정되면 제보자에게 주는 포인트 (서버 reward_policy MAPAE_REPORT) */
export const MAPAE_REPORT_POINT = 50;
/** 제보할 수 있는 가게와의 거리 (m) — 서버 ALLOWED_DISTANCE_M(현장인증)과 같다 */
export const MAPAE_REPORT_RADIUS_M = 100;

/** MAPAE-01 마패 제보 (사진은 uploadImage(file, 'MAPAE')로 먼저 올린다) */
export const createMapaeReport = (
  restaurantId: number,
  body: {
    eventType: MapaeEventType;
    memo: string | null;
    photoKey: string;
    lat: number;
    lng: number;
  },
) => api.post<MapaeReport>(`/restaurants/${restaurantId}/mapae-reports`, body);

/** MAPAE-02 내 제보 접수 현황 */
export const getMapaeReport = (reportId: number) =>
  api.get<MapaeReport>(`/mapae-reports/${reportId}`);

export type OwnerRelation = 'OWNER' | 'MANAGER';
export const OWNER_RELATIONS: { value: OwnerRelation; label: string }[] = [
  { value: 'OWNER', label: '대표자' },
  { value: 'MANAGER', label: '매장 관리자' },
];

export type ObjectionReason = 'ENDED' | 'NEVER' | 'ETC';
export const OBJECTION_REASONS: { value: ObjectionReason; label: string }[] = [
  { value: 'ENDED', label: '이벤트를 종료했어요' },
  { value: 'NEVER', label: '리뷰 이벤트를 한 적이 없어요' },
  { value: 'ETC', label: '기타' },
];

/** MAPAE-03 사장님 이의제기 (1:1 문의 MAPAE로 접수, 확인 자료는 uploadImage(file, 'INQUIRY')) */
export const createMapaeObjection = (
  restaurantId: number,
  body: {
    relation: OwnerRelation;
    reason: ObjectionReason;
    content: string;
    imageKey: string | null;
  },
) =>
  api.post<{ inquiryId: number; status: 'WAITING' }>(
    `/restaurants/${restaurantId}/mapae-objections`,
    body,
  );
