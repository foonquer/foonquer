import { describe, expect, it } from 'vitest';
import {
  formatDbDate,
  kstStartOfDbDate,
  kstTodayAsDbDate,
  toKstDate,
  toKstIso,
} from '../../src/common/time';

describe('KST 시각 변환', () => {
  it('UTC 시각을 +09:00 ISO 문자열로 바꾸고 밀리초는 버린다', () => {
    expect(toKstIso(new Date('2026-10-06T04:02:11.789Z'))).toBe('2026-10-06T13:02:11+09:00');
  });

  it('KST로 날짜가 넘어가는 시각을 맞게 처리한다', () => {
    const lateUtc = new Date('2026-12-31T16:30:00Z'); // KST 2027-01-01 01:30
    expect(toKstIso(lateUtc)).toBe('2027-01-01T01:30:00+09:00');
    expect(toKstDate(lateUtc)).toBe('2027-01-01');
  });

  it('DB DATE 값은 UTC로 읽어 하루가 밀리지 않는다', () => {
    expect(formatDbDate(new Date('2027-03-01T00:00:00Z'))).toBe('2027-03-01');
  });

  it('DB DATE의 KST 0시와 오늘 날짜를 구한다', () => {
    expect(kstStartOfDbDate(new Date('2026-09-01T00:00:00Z')).toISOString()).toBe(
      '2026-08-31T15:00:00.000Z',
    );
    expect(kstTodayAsDbDate(new Date('2026-10-05T16:00:00Z')).toISOString()).toBe(
      '2026-10-06T00:00:00.000Z',
    );
  });
});
