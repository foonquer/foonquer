import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import type { Bounds, MapRestaurant } from '../api/restaurants';
import pinConquered from '../assets/illust/pin-conquered.svg';
import pinUnconquered from '../assets/illust/pin-unconquered.svg';
import { KAKAO_MAP_KEY } from '../lib/config';
import {
  loadKakaoMaps,
  type KakaoEventHandler,
  type KakaoMap,
  type KakaoMaps,
  type KakaoOverlay,
} from '../lib/kakaoMaps';
import styles from './MapView.module.css';

type LatLng = { lat: number; lng: number };

/** 지도에 꽂는 핀 (가게 이름 + 정복했는지) */
export type MapPin = Pick<MapRestaurant, 'restaurantId' | 'name' | 'lat' | 'lng' | 'conquestState'>;

type Props = {
  pins: MapPin[];
  selectedId: number | null;
  onPinClick: (restaurantId: number) => void;
  /** 핀이 아닌 곳을 눌렀을 때 그 자리 좌표 (홈: 그 자리 가게 찾기) */
  onMapClick?: (point: LatLng) => void;
} & (
  | {
      /** 홈: 이 위치에서 시작하고 */
      center: LatLng;
      /** 지도를 다 움직였을 때 (처음 뜰 때도 한 번) */
      onBoundsChange: (bounds: Bounds) => void;
    }
  | {
      /** 맛집 리스트·PICK: 핀이 모두 보이게 맞추고 ＋/− 로 확대·축소 */
      fit: true;
    }
);

/** 카카오 지도 확대 수준 (작을수록 가깝다). 4는 화면 가로가 약 800m */
const LEVEL = 4;
/** 지도를 한 번 누른 것으로 보기 전에 두 번 누르기(확대)를 기다리는 시간 (ms) */
const DOUBLE_TAP_MS = 250;

/** 핀들이 놓인 범위 */
function spanOf(pins: MapPin[]) {
  const lats = pins.map((p) => p.lat);
  const lngs = pins.map((p) => p.lng);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  return {
    center: { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 },
    maxLat,
    lat: maxLat - minLat,
    lng: maxLng - minLng,
  };
}

/**
 * 지도. 카카오 지도 키가 있으면 카카오 지도를, 없거나 불러오지 못하면
 * 가게 위치만 점으로 보여 주는 간단한 지도를 그린다 (개발·테스트용).
 * 핀이 없으면 fit 지도는 그리지 않는다 (부르는 쪽에서 빈 화면을 보여 준다)
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
function pinElement(pin: MapPin, selected: boolean, onClick: () => void) {
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
  button.addEventListener('click', (event) => {
    // 핀을 누른 것은 지도를 누른 것으로 치지 않는다 (간단한 지도)
    event.stopPropagation();
    onClick();
  });
  return button;
}

function KakaoMapView(props: Props & { maps: KakaoMaps }) {
  const { maps, pins, selectedId, onPinClick, onMapClick } = props;
  const fit = 'fit' in props;
  const center = 'center' in props ? props.center : spanOf(pins).center;
  const onBoundsChange = 'onBoundsChange' in props ? props.onBoundsChange : undefined;
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<KakaoMap | null>(null);
  const overlays = useRef<KakaoOverlay[]>([]);
  // 이벤트 안에서 최신 함수를 부르도록
  const callbacks = useRef({ onPinClick, onBoundsChange, onMapClick });
  // 지도를 누르고 두 번 누르기를 기다리는 중 (그 사이 핀을 누르면 취소)
  const pendingClick = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    callbacks.current = { onPinClick, onBoundsChange, onMapClick };
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
      callbacks.current.onBoundsChange?.({
        swLat: sw.getLat(),
        swLng: sw.getLng(),
        neLat: ne.getLat(),
        neLng: ne.getLng(),
      });
    };
    maps.event.addListener(m, 'idle', emit);
    emit();
    // 두 번 눌러 확대할 때는 가게를 찾지 않는다
    const click: KakaoEventHandler = ({ latLng }) => {
      clearTimeout(pendingClick.current);
      const point = { lat: latLng.getLat(), lng: latLng.getLng() };
      pendingClick.current = setTimeout(() => callbacks.current.onMapClick?.(point), DOUBLE_TAP_MS);
    };
    const dblclick = () => clearTimeout(pendingClick.current);
    maps.event.addListener(m, 'click', click);
    maps.event.addListener(m, 'dblclick', dblclick);
    const resize = () => m.relayout();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      maps.event.removeListener(m, 'idle', emit);
      maps.event.removeListener(m, 'click', click);
      maps.event.removeListener(m, 'dblclick', dblclick);
      clearTimeout(pendingClick.current);
      map.current = null;
    };
    // 처음 위치만 쓴다. 이후 center 변경은 아래 effect가 옮긴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps]);

  // 동네를 바꾸면 그곳으로 옮긴다 (홈)
  useEffect(() => {
    if (!fit) map.current?.setCenter(new maps.LatLng(center.lat, center.lng));
  }, [maps, fit, center.lat, center.lng]);

  // 핀이 바뀌면 모두 보이게 맞춘다 (맛집 리스트·PICK). 한 곳뿐이면 동네 크기로
  const place = pins.map((p) => `${p.lat},${p.lng}`).join('|');
  useEffect(() => {
    const m = map.current;
    if (!fit || !m || pins.length === 0) return;
    if (pins.length === 1) {
      m.setLevel(LEVEL);
      m.setCenter(new maps.LatLng(pins[0].lat, pins[0].lng));
      return;
    }
    const bounds = new maps.LatLngBounds();
    pins.forEach((p) => bounds.extend(new maps.LatLng(p.lat, p.lng)));
    m.setBounds(bounds, 60, 50, 60, 50);
    // 좌표가 바뀔 때만 (고르기만 바꿔서는 다시 맞추지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps, fit, place]);

  // 핀 다시 그리기
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = pins.map((pin) => {
      const overlay = new maps.CustomOverlay({
        position: new maps.LatLng(pin.lat, pin.lng),
        content: pinElement(pin, pin.restaurantId === selectedId, () => {
          clearTimeout(pendingClick.current);
          callbacks.current.onPinClick(pin.restaurantId);
        }),
        xAnchor: 0.5,
        yAnchor: 1,
        clickable: true,
        zIndex: pin.restaurantId === selectedId ? 2 : 1,
      });
      overlay.setMap(m);
      return overlay;
    });
  }, [maps, pins, selectedId]);

  const zoom = (delta: number) => {
    const m = map.current;
    if (m) m.setLevel(m.getLevel() + delta, { animate: true });
  };
  return (
    <>
      <div ref={box} className={styles.map} />
      {fit && (
        <div className={styles.zoom}>
          <button type="button" aria-label="지도 확대" onClick={() => zoom(-1)}>
            ＋
          </button>
          <button type="button" aria-label="지도 축소" onClick={() => zoom(1)}>
            −
          </button>
        </div>
      )}
    </>
  );
}

/** 간단한 지도에서 보여 주는 범위 (가운데에서 위아래 약 500m, 좌우 약 530m) */
const HALF_LAT = 0.0045;
const HALF_LNG = 0.006;

function SimpleMap(props: Props & { notice: string }) {
  const { pins, selectedId, onPinClick, onMapClick, notice } = props;
  const fit = 'fit' in props;
  // fit이면 핀 끝이 위아래 25~88%, 좌우 15~85% 안에 오게 한다 (핀 그림은 위로, 이름은 아래로 붙는다).
  // 한 곳이거나 모여 있으면 너무 확대하지 않는다
  const span = spanOf(pins);
  const halfLat = fit ? Math.max(span.lat, 0.01) / 1.26 : HALF_LAT;
  const halfLng = fit ? Math.max(span.lng, 0.01) / 1.4 : HALF_LNG;
  const center =
    'center' in props ? props.center : { lat: span.maxLat - halfLat / 2, lng: span.center.lng };
  const layer = useRef<HTMLDivElement>(null);
  const boundsCallback = useRef('onBoundsChange' in props ? props.onBoundsChange : undefined);
  useEffect(() => {
    boundsCallback.current = 'onBoundsChange' in props ? props.onBoundsChange : undefined;
  });

  useEffect(() => {
    boundsCallback.current?.({
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
        node.style.left = `${((pin.lng - (center.lng - halfLng)) / (2 * halfLng)) * 100}%`;
        node.style.top = `${((center.lat + halfLat - pin.lat) / (2 * halfLat)) * 100}%`;
        node.classList.add(styles.simplePin);
        return node;
      }),
    );
  }, [pins, selectedId, center.lat, center.lng, halfLat, halfLng, onPinClick]);

  // 누른 곳을 화면 비율로 좌표로 바꾼다 (핀 놓는 계산의 반대)
  const click = (e: ReactMouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!onMapClick || rect.width === 0 || rect.height === 0) return;
    onMapClick({
      lat: center.lat + halfLat - ((e.clientY - rect.top) / rect.height) * 2 * halfLat,
      lng: center.lng - halfLng + ((e.clientX - rect.left) / rect.width) * 2 * halfLng,
    });
  };

  return (
    <div className={`${styles.map} ${styles.simple}`} onClick={click}>
      <div ref={layer} className={styles.layer} />
      <p className={styles.notice} data-fit={fit}>
        {notice}
      </p>
    </div>
  );
}
