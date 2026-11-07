import { distanceBetween } from '../../common/geo';
import { env } from '../../config/env';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { fetchFoodStoresInSigungu, type PublicStore, StoreDataError } from '../../lib/store-data';
import { findSeoulDongByCode, listSeoulSigungus, type RegionNode } from '../region/region.service';
import { storeNameMatches } from '../visit/visit.service';
import { categoryIdOfIndustry, EXCLUDED_INDUSTRY_CODES } from './category';

/** 카카오에서 저장했던 옛 가게를 공공데이터 가게와 같은 가게로 볼 최대 거리(m) */
const LINK_MAX_DISTANCE_M = 100;
/** createMany 한 번에 넣는 행 수 */
const INSERT_CHUNK = 1000;

/** 빈 문자열은 null, DB 컬럼 길이에 맞게 자른다 */
function text(value: string | null | undefined, max: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** 좌표는 DECIMAL(10,7)로 저장한다 */
function coordinate(value: string | number) {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? n.toFixed(7) : null;
}

interface StoreRow {
  bizesId: string;
  name: string;
  categoryId: number;
  categoryDetail: string | null;
  roadAddress: string | null;
  jibunAddress: string | null;
  regionId: number;
  sigunguId: number;
  lat: string;
  lng: string;
}

/** 상가업소 → restaurant 행. 가져오지 않는 업종이거나 서울 동·좌표가 없으면 null */
async function toRow(store: PublicStore): Promise<StoreRow | null> {
  if (EXCLUDED_INDUSTRY_CODES.has(store.indsSclsCd)) return null;
  const lat = coordinate(store.lat);
  const lng = coordinate(store.lon);
  const base = text(store.bizesNm, 100);
  const bizesId = text(store.bizesId, 30);
  if (!lat || !lng || !base || !bizesId) return null;
  const area = await findSeoulDongByCode(store.ldongCd);
  if (!area) return null;
  const branch = text(store.brchNm, 100);
  return {
    bizesId,
    name: branch && !base.includes(branch) ? `${base} ${branch}`.slice(0, 100) : base,
    categoryId: categoryIdOfIndustry(store.indsSclsCd),
    categoryDetail: text(store.indsSclsNm, 100),
    roadAddress: text(store.rdnmAdr, 255),
    jibunAddress: text(store.lnoAdr, 255),
    regionId: area.dong.id,
    sigunguId: area.sigungu.id,
    lat,
    lng,
  };
}

const existingSelect = {
  id: true,
  bizesId: true,
  name: true,
  categoryId: true,
  categoryDetail: true,
  roadAddress: true,
  jibunAddress: true,
  regionId: true,
  sigunguId: true,
  lat: true,
  lng: true,
  status: true,
} satisfies Prisma.RestaurantSelect;
type Existing = Prisma.RestaurantGetPayload<{ select: typeof existingSelect }>;

function isSame(cur: Existing, row: StoreRow) {
  return (
    cur.bizesId === row.bizesId &&
    cur.name === row.name &&
    cur.categoryId === row.categoryId &&
    cur.categoryDetail === row.categoryDetail &&
    cur.roadAddress === row.roadAddress &&
    cur.jibunAddress === row.jibunAddress &&
    cur.regionId === row.regionId &&
    cur.sigunguId === row.sigunguId &&
    cur.lat.toFixed(7) === row.lat &&
    cur.lng.toFixed(7) === row.lng
  );
}

/** 다시 나타난 폐업 가게는 영업으로 되돌린다 (운영자가 숨긴 H는 그대로) */
function reopened(cur: Existing) {
  return cur.status === 'C' ? { status: 'A' } : {};
}

/** 이름이 맞고 100m 안에 있는 옛 가게 중 가장 가까운 것 */
function takeLinkCandidate(candidates: Existing[], row: StoreRow) {
  let bestIndex = -1;
  let bestDistance = LINK_MAX_DISTANCE_M;
  for (const [index, cand] of candidates.entries()) {
    if (!storeNameMatches(cand.name, row.name)) continue;
    const distance = distanceBetween(
      cand.lat.toNumber(),
      cand.lng.toNumber(),
      Number(row.lat),
      Number(row.lng),
    );
    if (distance <= bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex < 0 ? null : candidates.splice(bestIndex, 1)[0];
}

/** 방문·정복·리뷰·저장·추천·먹깨비·마패 중 하나라도 이 가게를 가리키는 id */
async function referencedIds(ids: bigint[]) {
  if (ids.length === 0) return new Set<string>();
  const rows = await prisma.$queryRaw<{ id: bigint }[]>`
    SELECT r.id FROM restaurant r
    WHERE r.id IN (${Prisma.join(ids)}) AND (
      EXISTS (SELECT 1 FROM visit x WHERE x.restaurant_id = r.id)
      OR EXISTS (SELECT 1 FROM conquest x WHERE x.restaurant_id = r.id)
      OR EXISTS (SELECT 1 FROM review x WHERE x.restaurant_id = r.id)
      OR EXISTS (SELECT 1 FROM saved_restaurant x WHERE x.restaurant_id = r.id)
      OR EXISTS (SELECT 1 FROM member_pick x WHERE x.restaurant_id = r.id)
      OR EXISTS (SELECT 1 FROM restaurant_mapae x WHERE x.restaurant_id = r.id)
      OR EXISTS (SELECT 1 FROM mukkaebi x WHERE x.current_restaurant_id = r.id))`;
  return new Set(rows.map((r) => r.id.toString()));
}

export interface StoreImportResult {
  /** 받은 상가 수 */
  fetched: number;
  /** 가져오지 않은 상가 (구내식당·유흥 주점, 서울 동을 못 찾음, 좌표 없음) */
  skipped: number;
  created: number;
  updated: number;
  /** 카카오에서 저장했던 옛 가게를 공공데이터 가게와 이은 수 */
  linked: number;
  /** 목록에서 빠져 폐업(C)으로 바꾼 수 */
  closed: number;
  /** 이어지지 않고 아무 기록도 없어 지운 옛 가게 */
  legacyDeleted: number;
  /** 이어지지 않았지만 방문·리뷰 등이 있어 남긴 옛 가게 (직접 확인이 필요하다) */
  legacyKept: number;
}

/**
 * 한 구의 공공데이터 상가 목록을 restaurant에 반영한다.
 * - 상가업소번호(bizes_id)가 같은 가게는 바뀐 것만 갱신, 없으면 추가
 * - 처음 들어오는 가게는 이름이 맞고 100m 안에 있는 옛 가게(카카오에서 저장했던 bizes_id 없는 행, 또는 번호가 바뀐 행)가 있으면
 *   그 행을 이어서 쓴다 (방문·정복·리뷰가 가게 id를 가리키므로)
 * - 이 구에서 목록에 없는 가게는 폐업(C)으로, 이어지지 않은 옛 가게는 기록이 없으면 지운다
 *   (카카오 결과는 장소 ID 말고는 저장하면 안 된다)
 */
export async function importSigunguStores(
  sigungu: RegionNode,
  stores: PublicStore[],
): Promise<StoreImportResult> {
  const result: StoreImportResult = {
    fetched: stores.length,
    skipped: 0,
    created: 0,
    updated: 0,
    linked: 0,
    closed: 0,
    legacyDeleted: 0,
    legacyKept: 0,
  };
  const rows = new Map<string, StoreRow>();
  for (const store of stores) {
    const row = await toRow(store);
    if (row) rows.set(row.bizesId, row);
    else result.skipped += 1;
  }
  const ids = [...rows.keys()];

  // 이 구의 가게 + 다른 구에서 옮겨 온 가게(같은 번호)
  const existing = await prisma.restaurant.findMany({
    where: {
      OR: [{ sigunguId: sigungu.id }, ...(ids.length > 0 ? [{ bizesId: { in: ids } }] : [])],
    },
    select: existingSelect,
  });
  const byBizesId = new Map<string, Existing>();
  const leftovers: Existing[] = [];
  for (const cur of existing) {
    if (cur.bizesId && rows.has(cur.bizesId)) byBizesId.set(cur.bizesId, cur);
    else if (cur.sigunguId === sigungu.id) leftovers.push(cur);
  }

  const creates: StoreRow[] = [];
  for (const row of rows.values()) {
    const cur = byBizesId.get(row.bizesId);
    if (cur) {
      if (!isSame(cur, row) || cur.status === 'C') {
        await prisma.restaurant.update({
          where: { id: cur.id },
          data: { ...row, ...reopened(cur) },
        });
        result.updated += 1;
      }
      continue;
    }
    const legacy = takeLinkCandidate(leftovers, row);
    if (legacy) {
      await prisma.restaurant.update({
        where: { id: legacy.id },
        data: { ...row, ...reopened(legacy) },
      });
      result.linked += 1;
    } else {
      creates.push(row);
    }
  }
  for (let i = 0; i < creates.length; i += INSERT_CHUNK) {
    const { count } = await prisma.restaurant.createMany({
      data: creates.slice(i, i + INSERT_CHUNK),
      skipDuplicates: true,
    });
    result.created += count;
  }

  const gone = leftovers.filter((r) => r.bizesId !== null && r.status === 'A').map((r) => r.id);
  if (gone.length > 0) {
    const { count } = await prisma.restaurant.updateMany({
      where: { id: { in: gone } },
      data: { status: 'C' },
    });
    result.closed = count;
  }

  const legacy = leftovers.filter((r) => r.bizesId === null).map((r) => r.id);
  const keep = await referencedIds(legacy);
  const removable = legacy.filter((id) => !keep.has(id.toString()));
  if (removable.length > 0) {
    await prisma.$transaction([
      prisma.restaurantAspectStat.deleteMany({ where: { restaurantId: { in: removable } } }),
      prisma.restaurantStat.deleteMany({ where: { restaurantId: { in: removable } } }),
      prisma.restaurant.deleteMany({ where: { id: { in: removable } } }),
    ]);
  }
  result.legacyDeleted = removable.length;
  result.legacyKept = keep.size;
  return result;
}

/** store-import: 서울 25개 구의 음식 업종 상가를 공공데이터에서 가져온다 (구 하나가 실패해도 나머지는 계속) */
export async function runStoreImportJob() {
  if (!env.DATA_GO_KR_SERVICE_KEY) {
    return { skipped: 'DATA_GO_KR_SERVICE_KEY가 없어 가게를 가져오지 않았어요' };
  }
  const total: StoreImportResult & { sigungu: number; failed: number } = {
    sigungu: 0,
    fetched: 0,
    skipped: 0,
    created: 0,
    updated: 0,
    linked: 0,
    closed: 0,
    legacyDeleted: 0,
    legacyKept: 0,
    failed: 0,
  };
  for (const sigungu of await listSeoulSigungus()) {
    try {
      const stores = await fetchFoodStoresInSigungu(sigungu.code.slice(0, 5));
      // 서울 구에 음식 업종 상가가 0곳일 수는 없다. 빈 응답이면 일시 오류로 보고 폐업·삭제 처리를 하지 않는다
      if (stores.length === 0) throw new StoreDataError('상가 목록이 비어 있습니다.');
      const result = await importSigunguStores(sigungu, stores);
      for (const key of Object.keys(result) as (keyof StoreImportResult)[]) {
        total[key] += result[key];
      }
      total.sigungu += 1;
    } catch (err) {
      total.failed += 1;
      console.error(`[job] store-import ${sigungu.name} 실패`, err);
    }
  }
  return total;
}
