import { AppError } from '../../common/errors/app-error';
import { CommonError } from '../../common/errors/error-codes';
import { coordToLegalDongCode, KakaoApiError } from '../../lib/kakao-local';
import { prisma } from '../../lib/prisma';
import { RegionError } from './region.errors';
import { isSeoulCode } from './seoul-regions';

export interface RegionNode {
  id: number;
  code: string;
  name: string;
  fullName: string;
  level: number;
  parentId: number | null;
  centerLat: number | null;
  centerLng: number | null;
}

interface RegionIndex {
  byId: Map<number, RegionNode>;
  byCode: Map<string, RegionNode>;
  /** 서울 법정동(level 3) 목록 */
  seoulDongs: RegionNode[];
  /** '강서구 가양동' → 서울 법정동 (카카오 지번 주소로 동을 찾을 때) */
  seoulDongByName: Map<string, RegionNode>;
}

// 서울 구·동(약 500행)은 거의 바뀌지 않아 서버 메모리에 한 번 읽어 둔다 (REGION-01 명세 비고).
const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { index: RegionIndex; loadedAt: number } | null = null;

async function loadIndex(): Promise<RegionIndex> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.index;

  const rows = await prisma.region.findMany({ orderBy: { id: 'asc' } });
  const nodes: RegionNode[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    fullName: r.fullName,
    level: r.level,
    parentId: r.parentId,
    centerLat: r.centerLat === null ? null : Number(r.centerLat),
    centerLng: r.centerLng === null ? null : Number(r.centerLng),
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seoulDongs = nodes.filter((n) => n.level === 3 && isSeoulCode(n.code));
  const seoulDongByName = new Map<string, RegionNode>();
  for (const dong of seoulDongs) {
    const gu = dong.parentId === null ? undefined : byId.get(dong.parentId);
    if (gu) seoulDongByName.set(`${gu.name} ${dong.name}`, dong);
  }
  const index: RegionIndex = {
    byId,
    byCode: new Map(nodes.map((n) => [n.code, n])),
    seoulDongs,
    seoulDongByName,
  };
  // 아직 seed 전이면 캐시하지 않는다.
  if (nodes.length > 0) cache = { index, loadedAt: Date.now() };
  return index;
}

/** 동과 그 동이 속한 구 */
export interface DongWithSigungu {
  dong: RegionNode;
  sigungu: RegionNode;
}

/**
 * 동 id를 확인한다 (USER-03, LOCAL-02, SEARCH 공통 규칙).
 * 없으면 404 REGION_NOT_FOUND, 동이 아니면 REGION_NOT_DONG, 서울이 아니면 REGION_NOT_SUPPORTED.
 */
export async function requireSeoulDong(regionId: number): Promise<DongWithSigungu> {
  const index = await loadIndex();
  const region = index.byId.get(regionId);
  if (!region) throw new AppError(RegionError.REGION_NOT_FOUND);
  if (region.level !== 3) throw new AppError(RegionError.REGION_NOT_DONG);
  if (!isSeoulCode(region.code)) throw new AppError(RegionError.REGION_NOT_SUPPORTED);
  const sigungu = region.parentId === null ? undefined : index.byId.get(region.parentId);
  if (!sigungu) throw new AppError(RegionError.REGION_NOT_FOUND);
  return { dong: region, sigungu };
}

/** 구·동 이름으로 서울 법정동 찾기. 예) ('강서구', '가양동'). 없으면 null */
export async function findSeoulDongByName(sigunguName: string, dongName: string) {
  const index = await loadIndex();
  const dong = index.seoulDongByName.get(`${sigunguName} ${dongName}`);
  return dong ? withSigungu(index, dong) : null;
}

/** 법정동 코드(카카오 B 코드)로 서울 법정동 찾기. 없거나 동이 아니면 null */
export async function findSeoulDongByCode(code: string) {
  const index = await loadIndex();
  const dong = index.byCode.get(code);
  if (!dong || dong.level !== 3 || !isSeoulCode(dong.code)) return null;
  return withSigungu(index, dong);
}

function withSigungu(index: RegionIndex, dong: RegionNode): DongWithSigungu | null {
  const sigungu = dong.parentId === null ? undefined : index.byId.get(dong.parentId);
  return sigungu ? { dong, sigungu } : null;
}

/** 동(level 3) 또는 구(level 2)인 서울 지역 (RECO-01) */
export type SeoulArea =
  | { level: 3; dong: RegionNode; sigungu: RegionNode }
  | { level: 2; dong: null; sigungu: RegionNode };

/**
 * 동 또는 구 id를 확인한다. 없으면 404 REGION_NOT_FOUND,
 * 서울 밖이거나 시·도 단위면 400 REGION_NOT_SUPPORTED (메시지는 부르는 쪽에서 정할 수 있다).
 */
export async function requireSeoulArea(
  regionId: number,
  notSupportedMessage?: string,
): Promise<SeoulArea> {
  const index = await loadIndex();
  const region = index.byId.get(regionId);
  if (!region) throw new AppError(RegionError.REGION_NOT_FOUND);
  if (!isSeoulCode(region.code) || (region.level !== 2 && region.level !== 3)) {
    throw new AppError(RegionError.REGION_NOT_SUPPORTED, notSupportedMessage);
  }
  if (region.level === 2) return { level: 2, dong: null, sigungu: region };
  const found = withSigungu(index, region);
  if (!found) throw new AppError(RegionError.REGION_NOT_FOUND);
  return { level: 3, ...found };
}

/** REGION-01·02 응답 한 줄 */
export function toRegionItem({ dong, sigungu }: DongWithSigungu) {
  return {
    regionId: dong.id,
    dongName: dong.name,
    sigunguId: sigungu.id,
    sigunguName: sigungu.name,
    fullName: dong.fullName,
    centerLat: dong.centerLat,
    centerLng: dong.centerLng,
  };
}

/**
 * REGION-01 동 검색. 공백으로 나눈 단어가 모두 full_name에 들어간 서울 법정동.
 * 정렬: 동 이름 = 검색어 → 검색어로 시작 → 나머지, 같으면 동 이름 가나다순.
 */
export async function searchDongs(keyword: string, limit: number) {
  const index = await loadIndex();
  const words = keyword.split(/\s+/).filter(Boolean);
  const matched = index.seoulDongs.filter((d) => words.every((w) => d.fullName.includes(w)));

  const rank = (d: RegionNode) => (d.name === keyword ? 0 : d.name.startsWith(keyword) ? 1 : 2);
  matched.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'ko'));

  const items = matched.slice(0, limit).map((dong) => {
    const sigungu = dong.parentId === null ? undefined : index.byId.get(dong.parentId);
    if (!sigungu) throw new Error(`구가 없는 동: ${dong.code}`);
    return toRegionItem({ dong, sigungu });
  });
  return { keyword, items, totalCount: matched.length };
}

/** REGION-02 현재 위치로 동 찾기 (카카오 좌표 → 법정동 코드) */
export async function findDongByLocation(lat: number, lng: number) {
  let code: string | null;
  try {
    code = await coordToLegalDongCode(lat, lng);
  } catch (err) {
    if (!(err instanceof KakaoApiError)) throw err;
    console.error('카카오 좌표→행정구역 변환 실패', err);
    throw new AppError(
      CommonError.KAKAO_API_FAILED,
      '위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
    );
  }
  if (!code || !isSeoulCode(code)) {
    throw new AppError(
      RegionError.REGION_NOT_SUPPORTED,
      '지금은 서울에서만 쓸 수 있어요. 동네를 직접 골라 주세요.',
    );
  }
  const dong = (await loadIndex()).byCode.get(code);
  if (!dong || dong.level !== 3) {
    throw new AppError(RegionError.REGION_NOT_FOUND, '동네를 찾지 못했어요. 직접 골라 주세요.');
  }
  return toRegionItem(await requireSeoulDong(dong.id));
}
