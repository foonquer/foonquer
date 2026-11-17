// 먹짱 지도 이름표 자리 정하기: 먹깨비(동그라미)는 구 자리에 그대로 두고,
// 이름표는 아래 → 오른쪽 → 왼쪽 → 위 → 대각선 중 다른 먹깨비·이름표와 겹치지 않는 쪽에 단다.
// 먹짱 없는 구 이름도 되도록 피하고, 그래도 자리가 없으면 그 이름은 덮는다.
// 어디에도 자리가 없으면 이름표를 숨긴다. 고른 구는 늘 보여 주되 다른 먹깨비는 가리지 않는다

export type Side =
  'below' | 'right' | 'left' | 'above' | 'belowRight' | 'belowLeft' | 'aboveRight' | 'aboveLeft';
export type Box = { x: number; y: number; w: number; h: number };

export type MapMarker = {
  id: number;
  /** 판 위 자리 (px) */
  x: number;
  y: number;
  /** 이름표 크기 (px) */
  label: { w: number; h: number };
};

const SIDES: Side[] = [
  'below',
  'right',
  'left',
  'above',
  'belowRight',
  'belowLeft',
  'aboveRight',
  'aboveLeft',
];
/** 대각선 이름표가 먹깨비 모서리에 걸치는 정도 */
const TUCK = { x: 4, y: 2 };
/** 먹깨비와 이름표 사이 */
const GAP = 3;

/** 이만큼(px)은 겹쳐도 봐준다 — 먹깨비는 동그라미, 이름표는 모서리가 둥글어 네모 귀퉁이끼리는 실제로 안 겹친다 */
const SLACK = 3;
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w - SLACK &&
  b.x < a.x + a.w - SLACK &&
  a.y < b.y + b.h - SLACK &&
  b.y < a.y + a.h - SLACK;

/** 먹깨비 동그라미를 감싼 네모 */
export const avatarBox = (m: { x: number; y: number }, avatar: number): Box => ({
  x: m.x - avatar / 2,
  y: m.y - avatar / 2,
  w: avatar,
  h: avatar,
});

/** side 쪽에 단 이름표 네모 */
export function labelBox(m: MapMarker, side: Side, avatar: number): Box {
  const { w, h } = m.label;
  const r = avatar / 2;
  switch (side) {
    case 'below':
      return { x: m.x - w / 2, y: m.y + r + GAP, w, h };
    case 'above':
      return { x: m.x - w / 2, y: m.y - r - GAP - h, w, h };
    case 'right':
      return { x: m.x + r + GAP, y: m.y - h / 2, w, h };
    case 'left':
      return { x: m.x - r - GAP - w, y: m.y - h / 2, w, h };
    case 'belowRight':
      return { x: m.x + r - TUCK.x, y: m.y + r - TUCK.y, w, h };
    case 'belowLeft':
      return { x: m.x - r + TUCK.x - w, y: m.y + r - TUCK.y, w, h };
    case 'aboveRight':
      return { x: m.x + r - TUCK.x, y: m.y - r + TUCK.y - h, w, h };
    case 'aboveLeft':
      return { x: m.x - r + TUCK.x - w, y: m.y - r + TUCK.y - h, w, h };
  }
}

/**
 * markers는 먼저 자리를 줄 순서대로 (고른 구가 맨 앞). obstacles는 되도록 가리지 않을 것(먹짱 없는 구 이름).
 * 돌려주는 값: 구마다 이름표 쪽, 자리가 없으면 null. 고른 구(selectedId)는 자리가 없어도 단다
 */
export function placeLabels(
  markers: MapMarker[],
  obstacles: Box[],
  board: { width: number; height: number },
  avatar: number,
  selectedId: number | null,
): Map<number, Side | null> {
  const avatars = new Map(markers.map((m) => [m.id, avatarBox(m, avatar)]));
  const placed: Box[] = [];
  const result = new Map<number, Side | null>();
  const inside = (b: Box) =>
    b.x >= 0 && b.y >= 0 && b.x + b.w <= board.width && b.y + b.h <= board.height;

  for (const m of markers) {
    const free = (b: Box, avoidNames: boolean) =>
      inside(b) &&
      !placed.some((p) => overlaps(b, p)) &&
      !(avoidNames && obstacles.some((o) => overlaps(b, o))) &&
      ![...avatars].some(([id, a]) => id !== m.id && overlaps(b, a));
    const find = (avoidNames: boolean) =>
      SIDES.find((s) => free(labelBox(m, s, avatar), avoidNames)) ?? null;
    // 고른 구는 자리가 정말 없을 때만 아래에 (먼저 자리를 받아서 거의 없다)
    const chosen = find(true) ?? find(false) ?? (m.id === selectedId ? 'below' : null);
    result.set(m.id, chosen);
    if (chosen) placed.push(labelBox(m, chosen, avatar));
  }
  return result;
}

/** 이름표 글자 폭 어림 (한글은 글자 크기만큼, 영문·숫자는 0.6배) */
export function textWidth(text: string, fontSize: number) {
  let w = 0;
  for (const ch of text) w += /[ㄱ-힝]/.test(ch) ? fontSize : fontSize * 0.62;
  return w;
}
