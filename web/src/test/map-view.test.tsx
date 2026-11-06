import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MapView } from '../components/MapView';

// 카카오 지도 키가 있는 것으로 두고, SDK는 아래 가짜로 대신한다
vi.mock('../lib/config', () => ({ API_BASE_URL: '', API_PREFIX: '/api/v1', KAKAO_MAP_KEY: 'k' }));

/** 카카오 지도 SDK 흉내: 맞춘 범위와 확대 수준만 기록한다 */
function fakeKakao() {
  const seen = { fits: [] as number[][][], levels: [] as number[] };
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
    constructor(options: { content: HTMLElement }) {
      this.content = options.content;
    }
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
      event: { addListener() {}, removeListener() {} },
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
