// 카카오 지도 JavaScript SDK를 필요할 때 한 번만 불러온다.
// https://apis.map.kakao.com/web/documentation/ 에서 쓰는 것만 타입을 적었다.

export type KakaoLatLng = { getLat(): number; getLng(): number };

export type KakaoMap = {
  setCenter(latlng: KakaoLatLng): void;
  getBounds(): { getSouthWest(): KakaoLatLng; getNorthEast(): KakaoLatLng };
  relayout(): void;
};

export type KakaoOverlay = { setMap(map: KakaoMap | null): void };

export type KakaoMaps = {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMap;
  CustomOverlay: new (options: {
    position: KakaoLatLng;
    content: HTMLElement;
    xAnchor?: number;
    yAnchor?: number;
    clickable?: boolean;
    zIndex?: number;
  }) => KakaoOverlay;
  event: {
    addListener(target: KakaoMap, type: string, handler: () => void): void;
    removeListener(target: KakaoMap, type: string, handler: () => void): void;
  };
  load(callback: () => void): void;
};

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

let loading: Promise<KakaoMaps> | null = null;

/** SDK 스크립트를 붙이고 kakao.maps를 준다. 실패하면 다음에 다시 시도할 수 있게 비운다 */
export function loadKakaoMaps(appKey: string): Promise<KakaoMaps> {
  loading ??= new Promise<KakaoMaps>((resolve, reject) => {
    const ready = () => window.kakao!.maps.load(() => resolve(window.kakao!.maps));
    if (window.kakao?.maps) {
      ready();
      return;
    }
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.async = true;
    script.onload = () =>
      window.kakao?.maps ? ready() : reject(new Error('KAKAO_MAP_LOAD_FAILED'));
    script.onerror = () => reject(new Error('KAKAO_MAP_LOAD_FAILED'));
    document.head.append(script);
  }).catch((err: unknown) => {
    loading = null;
    throw err;
  });
  return loading;
}
