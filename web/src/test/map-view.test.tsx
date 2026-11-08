import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MapView } from '../components/MapView';

// 카카오 지도 키가 있는 것으로 두고, SDK는 아래 가짜로 대신한다
vi.mock('../lib/config', () => ({ API_BASE_URL: '', API_PREFIX: '/api/v1', KAKAO_MAP_KEY: 'k' }));

type Seen = ReturnType<typeof makeFakeKakao>;
let shared: Seen | null = null;

/**
 * 카카오 지도 SDK 흉내: 맞춘 범위와 확대 수준, 이벤트 처리 함수만 기록한다.
 * SDK는 한 번 불러오면 다시 쓰므로(loadKakaoMaps) 가짜도 하나만 만들고 기록만 비운다
 */
function fakeKakao() {
  if (shared) {
    // 앞 테스트 지도의 핀(body에 붙인 오버레이)이 남아 있으면 치운다
    document.body.replaceChildren();
    shared.fits.length = 0;
    shared.levels.length = 0;
    shared.listeners = {};
    return shared;
  }
  shared = makeFakeKakao();
  return shared;
}

function makeFakeKakao() {
  const seen = {
    fits: [] as number[][][],
    levels: [] as number[],
    listeners: {} as Record<string, (event?: { latLng: unknown }) => void>,
  };
  let level = 0;
  class LatLng {
    lat: number;
    lng: number;
    constructor(lat: number, lng: number) {
      this.lat = lat;
      this.lng = lng;
    }
    getLat = () => this.lat;
    getLng = () => this.lng;
  }
  class LatLngBounds {
    points: number[][] = [];
    extend(p: LatLng) {
      this.points.push([p.getLat(), p.getLng()]);
    }
  }
  class FakeMap {
    constructor(_el: HTMLElement, options: { level: number }) {
      level = options.level;
    }
    setCenter() {}
    getBounds = () => ({
      getSouthWest: () => new LatLng(0, 0),
      getNorthEast: () => new LatLng(1, 1),
    });
    setBounds(b: LatLngBounds) {
      seen.fits.push(b.points);
    }
    getLevel = () => level;
    setLevel(next: number) {
      level = next;
      seen.levels.push(next);
    }
    relayout() {}
  }
  class CustomOverlay {
    content: HTMLElement;
    position: LatLng;
    constructor(options: { content: HTMLElement; position: LatLng }) {
      this.content = options.content;
      this.position = options.position;
    }
    setPosition(p: LatLng) {
      this.position = p;
    }
    getPosition = () => this.position;
    setMap(map: unknown) {
      if (map) document.body.append(this.content);
      else this.content.remove();
    }
  }
  window.kakao = {
    maps: {
      LatLng,
      LatLngBounds,
      Map: FakeMap,
      CustomOverlay,
      event: {
        addListener(_map: unknown, type: string, handler: (event?: { latLng: unknown }) => void) {
          seen.listeners[type] = handler;
        },
        removeListener() {},
      },
      load: (callback: () => void) => callback(),
    } as unknown as NonNullable<Window['kakao']>['maps'],
  };
  return seen;
}

const pins = [
  {
    restaurantId: 1,
    name: '새맛집',
    lat: 37.56,
    lng: 126.85,
    conquestState: 'NOT_CONQUERED' as const,
  },
  {
    restaurantId: 2,
    name: '대전식탁',
    lat: 36.33,
    lng: 127.42,
    conquestState: 'CONQUERED' as const,
  },
];

describe('MapView fit (맛집 리스트·PICK 지도)', () => {
  it('핀이 모두 보이게 맞추고, 고르기만 바뀌면 다시 맞추지 않으며, ＋/−로 확대·축소한다', async () => {
    const seen = fakeKakao();
    const onPinClick = vi.fn();
    const { rerender } = render(
      <MapView fit pins={pins} selectedId={null} onPinClick={onPinClick} />,
    );

    await waitFor(() => expect(seen.fits).toHaveLength(1));
    expect(seen.fits[0]).toEqual([
      [37.56, 126.85],
      [36.33, 127.42],
    ]);

    fireEvent.click(screen.getByRole('button', { name: '대전식탁 (정복 완료)' }));
    expect(onPinClick).toHaveBeenCalledWith(2);
    rerender(<MapView fit pins={[...pins]} selectedId={2} onPinClick={onPinClick} />);
    expect(seen.fits).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '지도 확대' }));
    fireEvent.click(screen.getByRole('button', { name: '지도 축소' }));
    fireEvent.click(screen.getByRole('button', { name: '지도 축소' }));
    expect(seen.levels).toEqual([3, 4, 5]);
  });
});

describe('MapView 내 위치 (홈)', () => {
  it('내 위치에 먹깨비를 놓고, 위치가 바뀌면 걸어서 그 자리로 옮긴다', async () => {
    fakeKakao();
    const props = {
      center: { lat: 37.56, lng: 126.85 },
      pins,
      selectedId: null,
      onPinClick: vi.fn(),
      onBoundsChange: vi.fn(),
    };
    const marker = <span>내 먹깨비</span>;
    const { rerender } = render(
      <MapView {...props} me={{ coords: { lat: 37.56, lng: 126.85 }, marker }} />,
    );
    const label = await screen.findByText('내 먹깨비');
    const box = label.parentElement as HTMLElement;
    expect(box.dataset.walking).toBe('false');

    // 북쪽으로 20m
    const to = { lat: 37.56 + 20 / 111_320, lng: 126.85 };
    rerender(<MapView {...props} me={{ coords: to, marker }} />);
    expect(box.dataset.walking).toBe('true');
    await waitFor(() => expect(box.dataset.walking).toBe('false'), { timeout: 3000 });
    expect(screen.getAllByText('내 먹깨비')).toHaveLength(1);

    // 위치를 못 쓰게 되면 치운다
    rerender(<MapView {...props} me={null} />);
    expect(screen.queryByText('내 먹깨비')).not.toBeInTheDocument();
  });
});

describe('MapView 지도 누르기 (홈)', () => {
  it('핀이 아닌 곳을 누르면 그 자리 좌표를 알려 주고, 두 번 눌러 확대할 때는 알리지 않는다', async () => {
    const seen = fakeKakao();
    const onMapClick = vi.fn();
    render(
      <MapView
        center={{ lat: 37.56, lng: 126.85 }}
        pins={pins}
        selectedId={null}
        onPinClick={vi.fn()}
        onBoundsChange={vi.fn()}
        onMapClick={onMapClick}
      />,
    );

    await waitFor(() => expect(seen.listeners.click).toBeDefined());
    const { LatLng } = window.kakao!.maps;
    seen.listeners.click({ latLng: new LatLng(37.5612, 126.8534) });
    await waitFor(() => expect(onMapClick).toHaveBeenCalledWith({ lat: 37.5612, lng: 126.8534 }));

    onMapClick.mockClear();
    seen.listeners.click({ latLng: new LatLng(37.5612, 126.8534) });
    seen.listeners.click({ latLng: new LatLng(37.5612, 126.8534) });
    seen.listeners.dblclick();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(onMapClick).not.toHaveBeenCalled();

    // 누르고 곧바로 핀을 누르면 지도 누르기는 취소된다
    seen.listeners.click({ latLng: new LatLng(37.5612, 126.8534) });
    fireEvent.click(screen.getByRole('button', { name: '새맛집 (미정복)' }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(onMapClick).not.toHaveBeenCalled();
  });
});
