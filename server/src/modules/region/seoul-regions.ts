import data from './data/seoul-regions.json';

/** [남(최소 위도), 서(최소 경도), 북(최대 위도), 동(최대 경도)] */
export type BBox = [number, number, number, number];

export interface RegionSource {
  code: string;
  name: string;
  lat: number;
  lng: number;
  bbox: BBox;
}

export interface DongSource extends RegionSource {
  sigunguCode: string;
}

/**
 * 서울 구·법정동 기본 데이터 (region 테이블 seed의 원본).
 * DB region에는 중심 좌표만 두고, 경계 사각형(지도 영역이 서울인지 볼 때)은 여기서 읽는다.
 */
export const SEOUL = data.sido as RegionSource;
export const SEOUL_SIGUNGU = data.sigungu as RegionSource[];
export const SEOUL_DONG = data.dong as DongSource[];

/** 법정동 코드가 서울인지 (카카오 B 코드 포함) */
export function isSeoulCode(code: string) {
  return code.startsWith('11');
}
