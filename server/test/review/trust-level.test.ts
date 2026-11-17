import { describe, expect, it } from 'vitest';
import { trustLevelOf, trustViewOf } from '../../src/modules/review/trust-level';

describe('리뷰어 단계', () => {
  it.each([
    [1, 'SEED'],
    [44.9, 'SEED'],
    [45, 'SPROUT'],
    [59.9, 'SPROUT'],
    [60, 'LEAF'],
    [70, 'TREE'],
    [80, 'FOREST_1'],
    [85, 'FOREST_2'],
    [90, 'FOREST_3'],
    [99, 'FOREST_3'],
  ])('%s° → %s', (temp, level) => {
    expect(trustLevelOf(temp)).toBe(level);
  });

  it('다른 사람에게는 온도 숫자 없이, 잎새 미만이면 단계도 없이', () => {
    expect(trustViewOf(59.9, false)).toEqual({ trustTemp: null, trustLevel: null });
    expect(trustViewOf(60, false)).toEqual({ trustTemp: null, trustLevel: 'LEAF' });
    expect(trustViewOf(42.3, true)).toEqual({ trustTemp: 42.3, trustLevel: 'SEED' });
  });
});
