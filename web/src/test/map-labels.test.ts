import { describe, expect, it } from 'vitest';
import { avatarBox, labelBox, placeLabels, type MapMarker } from '../pages/ranking/mapLabels';
import { clampView, zoomAround } from '../pages/ranking/useZoomPan';

const board = { width: 346, height: 284 };
const marker = (id: number, x: number, y: number, w = 70): MapMarker => ({
  id,
  x,
  y,
  label: { w, h: 28 },
});
const overlaps = (a: ReturnType<typeof avatarBox>, b: ReturnType<typeof avatarBox>) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('먹짱 지도 이름표 자리 (placeLabels)', () => {
  it('자리가 있으면 아래에, 아래가 막히면 다른 쪽에 단다', () => {
    // 2번은 1번 바로 아래라 1번 이름표는 아래에 못 단다
    const sides = placeLabels([marker(1, 100, 100), marker(2, 100, 140)], [], board, 26, null);
    expect(sides.get(1)).not.toBe('below');
    expect(sides.get(2)).toBe('below');
  });

  it('붙어 있는 구가 많아도 이름표끼리·먹깨비와 겹치지 않고, 자리가 없으면 숨긴다', () => {
    const markers = [
      marker(1, 150, 150),
      marker(2, 178, 150),
      marker(3, 150, 178),
      marker(4, 178, 178),
      marker(5, 164, 164),
    ];
    const sides = placeLabels(markers, [], board, 26, null);
    const boxes = markers.flatMap((m) => {
      const side = sides.get(m.id);
      return side ? [{ id: m.id, box: labelBox(m, side, 26) }] : [];
    });
    for (const a of boxes) {
      for (const b of boxes) if (a.id !== b.id) expect(overlaps(a.box, b.box)).toBe(false);
      for (const m of markers)
        if (m.id !== a.id) expect(overlaps(a.box, avatarBox(m, 26))).toBe(false);
    }
    expect([...sides.values()].some((s) => s === null)).toBe(true);
  });

  it('고른 구는 자리가 없어도 이름표를 단다', () => {
    const crowded = [marker(9, 20, 20, 200), marker(1, 30, 30)];
    expect(placeLabels(crowded, [], board, 26, 9).get(9)).not.toBeNull();
  });

  it('먹짱 없는 구 이름(장애물)은 가리지 않는다', () => {
    const sides = placeLabels(
      [marker(1, 100, 100)],
      [{ x: 60, y: 115, w: 80, h: 14 }],
      board,
      26,
      null,
    );
    expect(sides.get(1)).not.toBe('below');
  });
});

describe('먹짱 지도 확대·이동 (zoomAround · clampView)', () => {
  const size = { width: 300, height: 240 };
  it('가운데를 기준으로 확대하면 가운데 점이 그 자리에 있다', () => {
    const v = zoomAround({ zoom: 1, x: 0, y: 0 }, 2, { x: 150, y: 120 }, size);
    expect(v).toEqual({ zoom: 2, x: -150, y: -120 });
  });
  it('1~3배까지만, 지도 밖 빈틈이 보이게 옮기지는 않는다', () => {
    expect(zoomAround({ zoom: 2, x: 0, y: 0 }, 9, { x: 0, y: 0 }, size).zoom).toBe(3);
    expect(zoomAround({ zoom: 2, x: 0, y: 0 }, 0.2, { x: 0, y: 0 }, size)).toEqual({
      zoom: 1,
      x: 0,
      y: 0,
    });
    expect(clampView({ zoom: 2, x: 50, y: -500 }, size)).toEqual({ zoom: 2, x: 0, y: -240 });
  });
});
