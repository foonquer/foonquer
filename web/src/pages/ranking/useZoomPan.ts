import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';

// 먹짱 지도 확대·이동: 두 손가락으로 벌리거나 +·− 버튼으로 확대하고, 한 손가락으로 끌어 옮긴다.
// 확대해도 먹깨비·이름표 크기는 그대로라 구 사이가 넓어져 이름표가 더 많이 들어간다

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;
/** 이만큼(px) 넘게 움직이면 끌기로 보고, 손을 뗄 때 누르기(click)는 무시한다 */
const DRAG_PX = 6;

type Size = { width: number; height: number };
type Point = { x: number; y: number };
export type View = { zoom: number; x: number; y: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** 확대한 지도가 판 밖으로 빈틈을 보이지 않게 옮긴 정도를 자른다 */
export function clampView(view: View, size: Size): View {
  return {
    zoom: view.zoom,
    x: clamp(view.x, size.width - size.width * view.zoom, 0),
    y: clamp(view.y, size.height - size.height * view.zoom, 0),
  };
}

/** from 화면에서 판 위 점 at을 그 자리에 둔 채로 zoom배로 */
export function zoomAround(from: View, zoom: number, at: Point, size: Size, to: Point = at): View {
  const z = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
  const cx = (at.x - from.x) / from.zoom;
  const cy = (at.y - from.y) / from.zoom;
  return clampView({ zoom: z, x: to.x - cx * z, y: to.y - cy * z }, size);
}

export function useZoomPan(size: Size) {
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  /** 손가락을 댄 순간의 화면과 위치 (끌기: 한 점, 벌리기: 두 점 사이 거리와 가운데) */
  const start = useRef<{ view: View; point: Point; distance: number } | null>(null);
  const dragged = useRef(false);

  const local = (e: PointerEvent<HTMLElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const begin = (current: View) => {
    const [a, b] = [...pointers.current.values()];
    if (!a) start.current = null;
    else if (!b) start.current = { view: current, point: a, distance: 0 };
    else start.current = { view: current, point: middle(a, b), distance: distance(a, b) };
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) dragged.current = false;
    begin(view);
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!pointers.current.has(e.pointerId) || !start.current) return;
    pointers.current.set(e.pointerId, local(e));
    const s = start.current;
    const [a, b] = [...pointers.current.values()];
    if (b) {
      // 두 손가락: 처음 가운데에 있던 지점을 지금 가운데로 옮기며 벌린 만큼 확대
      const mid = middle(a, b);
      dragged.current = true;
      setView(
        zoomAround(s.view, (s.view.zoom * distance(a, b)) / (s.distance || 1), s.point, size, mid),
      );
    } else {
      const dx = a.x - s.point.x;
      const dy = a.y - s.point.y;
      if (!dragged.current && Math.hypot(dx, dy) < DRAG_PX) return;
      dragged.current = true;
      setView(clampView({ ...s.view, x: s.view.x + dx, y: s.view.y + dy }, size));
    }
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    pointers.current.delete(e.pointerId);
    // 두 손가락 중 하나를 떼면 남은 손가락으로 이어서 끈다
    setView((current) => {
      begin(current);
      return current;
    });
  };
  /** 끌거나 벌린 뒤 손을 뗄 때 생기는 누르기는 구를 고르지 않게 막는다 */
  const onClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (!dragged.current) return;
    dragged.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  const center = { x: size.width / 2, y: size.height / 2 };
  return {
    view,
    zoomIn: () => setView((v) => zoomAround(v, v.zoom * 1.5, center, size)),
    zoomOut: () => setView((v) => zoomAround(v, v.zoom / 1.5, center, size)),
    reset: () => setView({ zoom: 1, x: 0, y: 0 }),
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClickCapture,
    },
  };
}
