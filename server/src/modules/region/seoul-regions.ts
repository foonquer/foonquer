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
 * DB region에는 중심 좌표만 두고, 카카오 검색 범위(rect)에 쓰는 경계 사각형은 여기서 읽는다.
 */
export const SEOUL = data.sido as RegionSource;
export const SEOUL_SIGUNGU = data.sigungu as RegionSource[];
export const SEOUL_DONG = data.dong as DongSource[];

const bboxByCode = new Map<string, BBox>(
  [SEOUL, ...SEOUL_SIGUNGU, ...SEOUL_DONG].map((r) => [r.code, r.bbox]),
);

/** 지역 코드의 경계 사각형 (없으면 null) */
export function bboxOfRegionCode(code: string): BBox | null {
  return bboxByCode.get(code) ?? null;
}

/** 법정동 코드가 서울인지 (카카오 B 코드 포함) */
export function isSeoulCode(code: string) {
  return code.startsWith('11');
}
