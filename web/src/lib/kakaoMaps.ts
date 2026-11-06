// 카카오 지도 JavaScript SDK를 필요할 때 한 번만 불러온다.
// https://apis.map.kakao.com/web/documentation/ 에서 쓰는 것만 타입을 적었다.

export type KakaoLatLng = { getLat(): number; getLng(): number };

export type KakaoLatLngBounds = { extend(latlng: KakaoLatLng): void };

export type KakaoMap = {
  setCenter(latlng: KakaoLatLng): void;
  getBounds(): { getSouthWest(): KakaoLatLng; getNorthEast(): KakaoLatLng };
  /** 범위가 모두 보이게 (여백 위·오른쪽·아래·왼쪽 px) */
  setBounds(
    bounds: KakaoLatLngBounds,
    paddingTop?: number,
    paddingRight?: number,
    paddingBottom?: number,
    paddingLeft?: number,
  ): void;
  getLevel(): number;
  setLevel(level: number, options?: { animate?: boolean }): void;
  relayout(): void;
};

export type KakaoOverlay = { setMap(map: KakaoMap | null): void };

export type KakaoMaps = {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
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

/**
 * SDK가 이만큼 안에 준비되지 않으면 실패로 본다 (ms).
 * 도메인을 등록하지 않았거나 하위 스크립트가 막히면 maps.load 콜백이 영영 오지 않는다.
 */
const LOAD_TIMEOUT_MS = 10_000;

/** SDK 스크립트를 붙이고 kakao.maps를 준다. 실패하면 붙인 스크립트를 떼고, 다음에 다시 시도할 수 있게 비운다 */
export function loadKakaoMaps(appKey: string): Promise<KakaoMaps> {
  let script: HTMLScriptElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  loading ??= new Promise<KakaoMaps>((resolve, reject) => {
    const fail = () => reject(new Error('KAKAO_MAP_LOAD_FAILED'));
    timer = setTimeout(fail, LOAD_TIMEOUT_MS);
    const ready = () => window.kakao!.maps.load(() => resolve(window.kakao!.maps));
    if (window.kakao?.maps) {
      ready();
      return;
    }
    script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.async = true;
    script.addEventListener('load', () => (window.kakao?.maps ? ready() : fail()), { once: true });
    script.addEventListener('error', fail, { once: true });
    document.head.append(script);
  }).then(
    (maps) => {
      clearTimeout(timer);
      return maps;
    },
    (err: unknown) => {
      clearTimeout(timer);
      script?.remove();
      loading = null;
      throw err;
    },
  );
  return loading;
}
