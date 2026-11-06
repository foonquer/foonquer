import { describe, expect, it } from 'vitest';
import { agoGroup, formatAgo } from '../lib/format';

describe('알림 시각 (formatAgo · agoGroup)', () => {
  // KST 11월 6일 00:30 = UTC 11월 5일 15:30
  const now = new Date('2026-11-06T00:30:00+09:00');

  it('오프셋이 +09:00이 아니어도 한국 날짜로 오늘·어제를 나눈다', () => {
    // UTC 11월 5일 15:00 = KST 11월 6일 00:00 → 오늘
    expect(agoGroup('2026-11-05T15:00:00Z', now)).toBe('오늘');
    expect(formatAgo('2026-11-05T15:00:00Z', now)).toBe('30분 전');
    // UTC 11월 5일 14:00 = KST 11월 5일 23:00 → 어제
    expect(agoGroup('2026-11-05T14:00:00Z', now)).toBe('이번 주');
    expect(formatAgo('2026-11-05T14:00:00Z', now)).toBe('어제');
  });

  it('같은 시각을 +09:00로 줘도 결과가 같다', () => {
    expect(agoGroup('2026-11-06T00:00:00+09:00', now)).toBe('오늘');
    expect(formatAgo('2026-11-05T23:00:00+09:00', now)).toBe('어제');
  });
});
