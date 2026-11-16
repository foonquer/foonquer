import { describe, expect, it } from 'vitest';
import { buildRoute } from '../pages/visit/journey';

describe('먹깨비 따라가기 길 (buildRoute)', () => {
  it('아래 출발에서 위 가운데 도착까지, 좌우로 오가며 올라간다', () => {
    const r = buildRoute(390, 844, 290, 150);
    expect(r.start).toEqual({ x: 390 * 0.24, y: 844 - 150 });
    expect(r.end).toEqual({ x: 195, y: 290 });
    expect(r.at(0)).toMatchObject({ x: r.start.x, y: r.start.y });
    expect(r.at(1).x).toBeCloseTo(r.end.x, 5);
    expect(r.at(1).y).toBeCloseTo(r.end.y, 5);
    // 꼬불꼬불: 곧은 거리보다 훨씬 길고, 가는 방향이 여러 번 바뀐다
    expect(r.length).toBeGreaterThan(Math.hypot(r.end.x - r.start.x, r.end.y - r.start.y) * 1.5);
    const dirs = Array.from({ length: 50 }, (_, i) => Math.sign(r.at(i / 50 + 0.01).dx));
    expect(
      dirs.filter((d, i) => i > 0 && d !== 0 && d !== dirs[i - 1]).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('화면이 낮으면 꺾는 횟수를 줄인다', () => {
    expect(buildRoute(375, 667, 290, 150).d.match(/C /g)).toHaveLength(3);
    expect(buildRoute(390, 844, 290, 150).d.match(/C /g)).toHaveLength(4);
  });
});
