import { describe, expect, it } from 'vitest';
import { agoGroup, formatAgo, noRatingText } from '../lib/format';
import { scoreBand, tasteCriterion } from '../lib/taste';

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

describe('별점이 없을 때 문구 (noRatingText)', () => {
  it('리뷰 0개면 아직 없음, 1~4개면 5개부터 보인다고 알려 준다', () => {
    expect(noRatingText(0)).toBe('아직 별점이 없어요');
    expect(noRatingText(3)).toBe('리뷰 5개부터 별점이 보여요 (지금 3개)');
    expect(noRatingText(0, true)).toBe('아직 별점 없음');
    expect(noRatingText(4, true)).toBe('별점은 리뷰 5개부터');
  });
});

describe('가게 맛 별점의 점수대 (scoreBand)', () => {
  it('맛 기준표와 같은 0.5점 구간으로 보여 준다 (3.6 → 3.5점대)', () => {
    expect(scoreBand(3.6)).toBe('3.5점대');
    expect(tasteCriterion(3.6).text).toBe('근처에 있다면 다시 먹고 싶은 맛');
    expect(scoreBand(4.4)).toBe('4.0점대');
    expect(scoreBand(4.5)).toBe('4.5점대');
    expect(scoreBand(3.0)).toBe('3.0점대');
  });
});
