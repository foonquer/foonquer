// 먹깨비 따라가기 화면의 꼬불꼬불 길 (화면 크기에 맞춰 만든다, 단위 px)

export type Point = { x: number; y: number };
export type Decor = Point & { kind: 'tree' | 'bush' | 'house' | 'flower'; size: number };

export type Route = {
  /** SVG path d */
  d: string;
  /** 길 전체 길이 */
  length: number;
  start: Point;
  end: Point;
  decor: Decor[];
  /** 길의 처음부터 progress(0~1)만큼 간 곳. dx는 그때 가는 방향(왼쪽이면 음수) */
  at: (progress: number) => Point & { dx: number };
};

/** 한 구간(곡선)을 나눠 길이를 재는 개수 */
const SAMPLES = 64;

function cubic(p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const e = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + e * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + e * p1.y,
  };
}

/**
 * 아래(출발)에서 위(도착)까지 좌우로 오가며 올라가는 길.
 * 꺾이는 곳은 화면 왼쪽·오른쪽 1/4 자리이고, 도착은 가운데. top·bottom은 글자·버튼이 놓일 자리라 비워 둔다
 */
export function buildRoute(width: number, height: number, top = 200, bottom = 170): Route {
  const legs = height - top - bottom >= 360 ? 4 : 3;
  const startY = height - bottom;
  const endY = top;
  const left = width * 0.24;
  const right = width * 0.76;
  const turns: Point[] = Array.from({ length: legs + 1 }, (_, i) => ({
    x: i === legs ? width / 2 : i % 2 === 0 ? left : right,
    y: startY + ((endY - startY) * i) / legs,
  }));

  // 꺾이는 곳에서는 위로 올라가고, 사이에서는 비스듬히 가로지른다 (S자)
  const curves = turns.slice(1).map((p1, i) => {
    const p0 = turns[i];
    const k = (p0.y - p1.y) * 0.62;
    return [p0, { x: p0.x, y: p0.y - k }, { x: p1.x, y: p1.y + k }, p1] as const;
  });
  const d =
    `M ${turns[0].x.toFixed(1)} ${turns[0].y.toFixed(1)} ` +
    curves
      .map(([, c1, c2, p1]) =>
        [c1, c2, p1].map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),
      )
      .map((s) => `C ${s}`)
      .join(' ');

  // 일정한 간격으로 점을 찍어 두고, 지나온 길이로 위치를 찾는다
  const points: Point[] = [turns[0]];
  const lengths = [0];
  for (const [p0, c1, c2, p1] of curves) {
    for (let s = 1; s <= SAMPLES; s += 1) {
      const p = cubic(p0, c1, c2, p1, s / SAMPLES);
      const prev = points[points.length - 1];
      points.push(p);
      lengths.push(lengths[lengths.length - 1] + Math.hypot(p.x - prev.x, p.y - prev.y));
    }
  }
  const length = lengths[lengths.length - 1];

  const at = (progress: number) => {
    const target = Math.min(1, Math.max(0, progress)) * length;
    let lo = 0;
    let hi = lengths.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lengths[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const a = points[i - 1];
    const b = points[i];
    const span = lengths[i] - lengths[i - 1] || 1;
    const t = (target - lengths[i - 1]) / span;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: b.x - a.x };
  };

  // 꺾이는 곳 안쪽(길이 없는 쪽)에 나무, 바깥 가장자리에 꽃, 출발 옆에 집, 도착 양옆에 나무
  const decor: Decor[] = [];
  turns.slice(1, -1).forEach((p, i) => {
    const inner = width - p.x;
    decor.push({ kind: i % 2 === 0 ? 'tree' : 'bush', x: inner, y: p.y + 8, size: 1 });
    decor.push({ kind: 'tree', x: inner + (p.x < width / 2 ? 34 : -34), y: p.y + 26, size: 0.7 });
    decor.push({
      kind: 'flower',
      x: p.x < width / 2 ? width * 0.07 : width * 0.93,
      y: p.y + 4,
      size: 1,
    });
  });
  decor.push({ kind: 'house', x: right, y: startY + 6, size: 1 });
  decor.push({ kind: 'flower', x: right + 44, y: startY + 26, size: 0.8 });
  decor.push({ kind: 'tree', x: width * 0.16, y: endY + 34, size: 0.9 });
  decor.push({ kind: 'bush', x: width * 0.84, y: endY + 40, size: 0.9 });

  return { d, length, start: turns[0], end: turns[legs], decor, at };
}
