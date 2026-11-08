import { Prisma } from '../../generated/prisma/client';
import { KakaoApiError, type KakaoPlace, searchPlacesNear } from '../../lib/kakao-local';
import { prisma } from '../../lib/prisma';
import { storeNameMatches } from '../visit/visit.service';

/** 같은 가게로 볼 카카오 장소의 최대 거리(m) */
const NEAR_RADIUS_M = 100;

interface LinkTarget {
  id: bigint;
  name: string;
  lat: { toNumber(): number };
  lng: { toNumber(): number };
  kakaoPlaceId: string | null;
}

/**
 * 음식점 상세(REST-01)에서 카카오의 같은 가게를 실시간으로 찾는다.
 * 카카오 이용 정책상 결과(전화번호 등)는 저장하지 않고 응답에만 쓰며, 저장해도 되는 장소 ID만
 * 처음 찾았을 때 restaurant.kakao_place_id에 남긴다.
 * 장소 ID가 있으면 그 장소, 없으면 100m 안에서 가까운 순으로 이름이 맞는 첫 장소. 못 찾거나 카카오가 실패하면 null
 */
export async function findKakaoPlace(r: LinkTarget): Promise<KakaoPlace | null> {
  let places: KakaoPlace[];
  try {
    places = await searchPlacesNear(r.name, r.lat.toNumber(), r.lng.toNumber(), NEAR_RADIUS_M);
  } catch (err) {
    if (!(err instanceof KakaoApiError)) throw err;
    console.error(`카카오 장소 찾기 실패 (가게 ${r.id.toString()})`, err);
    return null;
  }
  const place = r.kakaoPlaceId
    ? places.find((p) => p.id === r.kakaoPlaceId)
    : places.find((p) => storeNameMatches(p.place_name, r.name));
  if (!place || r.kakaoPlaceId) return place ?? null;
  await saveKakaoPlaceId(r.id, place.id);
  return place;
}

/** 처음 찾은 카카오 장소 ID만 저장한다 (카카오 이용 정책상 저장해도 되는 값). 이미 ID가 있으면 그대로 둔다 */
export async function saveKakaoPlaceId(restaurantId: bigint, placeId: string) {
  try {
    await prisma.restaurant.updateMany({
      where: { id: restaurantId, kakaoPlaceId: null },
      data: { kakaoPlaceId: placeId },
    });
  } catch (err) {
    // 공공데이터에 같은 가게가 두 번 있어 다른 행이 이미 이 ID를 가졌으면 저장하지 않는다
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
  }
}
