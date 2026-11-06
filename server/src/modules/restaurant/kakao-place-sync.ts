import { coordToLegalDongCode, type KakaoPlace } from '../../lib/kakao-local';
import { prisma } from '../../lib/prisma';
import {
  type DongWithSigungu,
  findSeoulDongByCode,
  findSeoulDongByName,
} from '../region/region.service';
import { categoryIdOf } from './category';

/** 빈 문자열은 null, DB 컬럼 길이에 맞게 자른다 */
function text(value: string | undefined, max: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** 좌표는 DECIMAL(10,7)로 저장한다 */
function coordinate(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(7) : null;
}

/** 가게 하나씩 처리할 때 동시에 진행할 개수 (DB 연결 풀 10개, 카카오 호출 수를 넘지 않게) */
const CONCURRENCY = 5;

/** items를 limit개씩 동시에 처리한다 (결과 순서는 items와 같다) */
async function mapLimited<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * 가게의 동·구 찾기. 지번 주소("서울 강서구 가양동 1487")의 구·동 이름으로 먼저 찾고,
 * 못 찾으면 좌표 → 법정동 코드(카카오 coord2regioncode)로 보완한다. 서울이 아니면 null.
 */
async function resolveDong(place: KakaoPlace, lat: string, lng: string) {
  const [sido, sigungu, dong] = place.address_name.trim().split(/\s+/);
  if (sido && !sido.startsWith('서울')) return null;
  if (sigungu && dong) {
    const found = await findSeoulDongByName(sigungu, dong);
    if (found) return found;
  }
  try {
    const code = await coordToLegalDongCode(Number(lat), Number(lng));
    return code ? await findSeoulDongByCode(code) : null;
  } catch (err) {
    console.error(`카카오 좌표→행정구역 변환 실패 (place ${place.id})`, err);
    return null;
  }
}

/**
 * 카카오 장소 검색 결과를 restaurant에 반영한다 (MAP-01·SEARCH-02 공통 규칙, 방문 인증 등에서도 쓸 수 있다).
 * - 처음 보는 가게(kakao_place_id 없음)는 insert. 서울이 아니거나 동을 못 찾으면 저장하지 않는다.
 * - 이미 있는 가게는 이름·전화·주소·좌표만 바뀌었을 때 갱신한다 (카테고리·동·상태는 건드리지 않는다).
 */
export async function saveKakaoPlaces(places: KakaoPlace[]) {
  const unique = [...new Map(places.map((p) => [p.id, p])).values()];
  if (unique.length === 0) return;

  const existing = await prisma.restaurant.findMany({
    where: { kakaoPlaceId: { in: unique.map((p) => p.id) } },
    select: {
      id: true,
      kakaoPlaceId: true,
      name: true,
      phone: true,
      roadAddress: true,
      jibunAddress: true,
      lat: true,
      lng: true,
    },
  });
  const byKakaoId = new Map(existing.map((r) => [r.kakaoPlaceId, r]));

  // 가게마다 갱신·동 찾기(카카오 호출일 수 있음)를 기다리면 가게 수만큼 느려지므로 몇 개씩 동시에 처리한다.
  const results = await mapLimited(unique, CONCURRENCY, async (place) => {
    const lat = coordinate(place.y);
    const lng = coordinate(place.x);
    const name = text(place.place_name, 100);
    if (!lat || !lng || !name) return null;
    const fields = {
      name,
      phone: text(place.phone, 20),
      roadAddress: text(place.road_address_name, 255),
      jibunAddress: text(place.address_name, 255),
    };

    const current = byKakaoId.get(place.id);
    if (current) {
      const changed =
        current.name !== fields.name ||
        current.phone !== fields.phone ||
        current.roadAddress !== fields.roadAddress ||
        current.jibunAddress !== fields.jibunAddress ||
        current.lat.toFixed(7) !== lat ||
        current.lng.toFixed(7) !== lng;
      if (changed) {
        await prisma.restaurant.update({
          where: { id: current.id },
          data: { ...fields, lat, lng },
        });
      }
      return null;
    }

    const area: DongWithSigungu | null = await resolveDong(place, lat, lng);
    if (!area) return null;
    return {
      kakaoPlaceId: place.id,
      ...fields,
      categoryId: categoryIdOf(place.category_name ?? '', place.category_group_code ?? ''),
      kakaoCategoryName: text(place.category_name, 100),
      regionId: area.dong.id,
      sigunguId: area.sigungu.id,
      lat,
      lng,
    };
  });
  const inserts = results.filter((row) => row !== null);

  // 같은 가게를 동시에 저장하려 하면 kakao_place_id unique에 걸리므로 겹치는 행은 건너뛴다.
  if (inserts.length > 0) {
    await prisma.restaurant.createMany({ data: inserts, skipDuplicates: true });
  }
}
