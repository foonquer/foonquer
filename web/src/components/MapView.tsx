import { useEffect, useRef, useState } from 'react';
import type { Bounds, MapRestaurant } from '../api/restaurants';
import pinConquered from '../assets/illust/pin-conquered.svg';
import pinUnconquered from '../assets/illust/pin-unconquered.svg';
import { KAKAO_MAP_KEY } from '../lib/config';
import { loadKakaoMaps, type KakaoMap, type KakaoMaps, type KakaoOverlay } from '../lib/kakaoMaps';
import styles from './MapView.module.css';

type LatLng = { lat: number; lng: number };

type Props = {
  center: LatLng;
  pins: MapRestaurant[];
  selectedId: number | null;
  onPinClick: (restaurantId: number) => void;
  /** 지도를 다 움직였을 때 (처음 뜰 때도 한 번) */
  onBoundsChange: (bounds: Bounds) => void;
};

/** 카카오 지도 확대 수준 (작을수록 가깝다). 4는 화면 가로가 약 800m */
const LEVEL = 4;

/**
 * 홈 지도. 카카오 지도 키가 있으면 카카오 지도를, 없거나 불러오지 못하면
 * 가게 위치만 점으로 보여 주는 간단한 지도를 그린다 (개발·테스트용).
 */
export function MapView(props: Props) {
  const [kakao, setKakao] = useState<KakaoMaps | 'failed' | null>(KAKAO_MAP_KEY ? null : 'failed');

  useEffect(() => {
    if (!KAKAO_MAP_KEY) return;
    let alive = true;
    loadKakaoMaps(KAKAO_MAP_KEY).then(
      (maps) => alive && setKakao(maps),
      () => alive && setKakao('failed'),
    );
    return () => {
      alive = false;
    };
  }, []);

  if (kakao === null) return <div className={styles.map} aria-busy="true" />;
  if (kakao === 'failed') {
    return (
      <SimpleMap
        {...props}
        notice={
          KAKAO_MAP_KEY
            ? '지도를 불러오지 못해 가게 위치만 보여 드려요'
            : '카카오 지도 키(VITE_KAKAO_MAP_KEY)가 없어 간단한 지도로 보여요'
        }
      />
    );
  }
  return <KakaoMapView {...props} maps={kakao} />;
}

/** 핀 하나 (그림 + 가게 이름). 카카오 지도 오버레이와 간단한 지도가 같이 쓴다 */
function pinElement(pin: MapRestaurant, selected: boolean, onClick: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = styles.pin;
  button.dataset.selected = String(selected);
  button.setAttribute(
    'aria-label',
    `${pin.name} (${pin.conquestState === 'CONQUERED' ? '정복 완료' : '미정복'})`,
  );
  const img = document.createElement('img');
  img.src = pin.conquestState === 'CONQUERED' ? pinConquered : pinUnconquered;
  img.alt = '';
  img.className = styles.pinImage;
  const label = document.createElement('span');
  label.className = styles.pinLabel;
  label.textContent = pin.name;
  button.append(img, label);
  button.addEventListener('click', onClick);
  return button;
}

function KakaoMapView({
  maps,
  center,
  pins,
  selectedId,
  onPinClick,
  onBoundsChange,
}: Props & { maps: KakaoMaps }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<KakaoMap | null>(null);
  const overlays = useRef<KakaoOverlay[]>([]);
  // 이벤트 안에서 최신 함수를 부르도록
  const callbacks = useRef({ onPinClick, onBoundsChange });
  useEffect(() => {
    callbacks.current = { onPinClick, onBoundsChange };
  });

  // 지도 만들기 (한 번)
  useEffect(() => {
    if (!box.current) return;
    const m = new maps.Map(box.current, {
      center: new maps.LatLng(center.lat, center.lng),
      level: LEVEL,
    });
    map.current = m;
    const emit = () => {
      const b = m.getBounds();
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      callbacks.current.onBoundsChange({
        swLat: sw.getLat(),
        swLng: sw.getLng(),
        neLat: ne.getLat(),
        neLng: ne.getLng(),
      });
    };
    maps.event.addListener(m, 'idle', emit);
    emit();
    const resize = () => m.relayout();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      maps.event.removeListener(m, 'idle', emit);
      map.current = null;
    };
    // 처음 위치만 쓴다. 이후 center 변경은 아래 effect가 옮긴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps]);

  // 동네를 바꾸면 그곳으로 옮긴다
  useEffect(() => {
    map.current?.setCenter(new maps.LatLng(center.lat, center.lng));
  }, [maps, center.lat, center.lng]);

  // 핀 다시 그리기
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = pins.map((pin) => {
      const overlay = new maps.CustomOverlay({
        position: new maps.LatLng(pin.lat, pin.lng),
        content: pinElement(pin, pin.restaurantId === selectedId, () =>
          callbacks.current.onPinClick(pin.restaurantId),
        ),
        xAnchor: 0.5,
        yAnchor: 1,
        clickable: true,
        zIndex: pin.restaurantId === selectedId ? 2 : 1,
      });
      overlay.setMap(m);
      return overlay;
    });
  }, [maps, pins, selectedId]);

  return <div ref={box} className={styles.map} />;
}

/** 간단한 지도에서 보여 주는 범위 (가운데에서 위아래 약 500m, 좌우 약 530m) */
const HALF_LAT = 0.0045;
const HALF_LNG = 0.006;

function SimpleMap({
  center,
  pins,
  selectedId,
  onPinClick,
  onBoundsChange,
  notice,
}: Props & { notice: string }) {
  const layer = useRef<HTMLDivElement>(null);
  const boundsCallback = useRef(onBoundsChange);
  useEffect(() => {
    boundsCallback.current = onBoundsChange;
  });

  useEffect(() => {
    boundsCallback.current({
      swLat: center.lat - HALF_LAT,
      swLng: center.lng - HALF_LNG,
      neLat: center.lat + HALF_LAT,
      neLng: center.lng + HALF_LNG,
    });
  }, [center.lat, center.lng]);

  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    el.replaceChildren(
      ...pins.map((pin) => {
        const node = pinElement(pin, pin.restaurantId === selectedId, () =>
          onPinClick(pin.restaurantId),
        );
        node.style.left = `${((pin.lng - (center.lng - HALF_LNG)) / (2 * HALF_LNG)) * 100}%`;
        node.style.top = `${((center.lat + HALF_LAT - pin.lat) / (2 * HALF_LAT)) * 100}%`;
        node.classList.add(styles.simplePin);
        return node;
      }),
    );
  }, [pins, selectedId, center.lat, center.lng, onPinClick]);

  return (
    <div className={`${styles.map} ${styles.simple}`}>
      <div ref={layer} className={styles.layer} />
      <p className={styles.notice}>{notice}</p>
    </div>
  );
}
