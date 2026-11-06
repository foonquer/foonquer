import { describe, expect, it } from 'vitest';
import {
  type BusinessHours,
  businessStatusOf,
  parseBusinessHours,
} from '../../src/modules/restaurant/business-hours';
import { categoryIdOf } from '../../src/modules/restaurant/category';

describe('categoryIdOf — 카카오 분류 → 우리 카테고리 12개', () => {
  it.each([
    ['음식점 > 한식 > 국수 > 칼국수', 'FD6', 1],
    ['음식점 > 한식', 'FD6', 1],
    ['음식점 > 한식 > 육류,고기 > 삼겹살', 'FD6', 6],
    ['음식점 > 한식 > 해물,생선 > 회', 'FD6', 7],
    ['음식점 > 중식 > 중국요리', 'FD6', 2],
    ['음식점 > 일식 > 초밥,롤', 'FD6', 3],
    ['음식점 > 양식 > 이탈리안', 'FD6', 4],
    ['음식점 > 분식', 'FD6', 5],
    ['음식점 > 치킨', 'FD6', 8],
    ['음식점 > 패스트푸드 > 맥도날드', 'FD6', 9],
    ['음식점 > 아시아음식 > 베트남음식', 'FD6', 10],
    ['음식점 > 카페 > 커피전문점', 'FD6', 11],
    ['음식점 > 간식 > 제과,베이커리', 'FD6', 11],
    ['카페 > 커피전문점 > 스타벅스', 'CE7', 11],
    ['음식점 > 술집 > 호프,요리주점', 'FD6', 12],
    ['음식점 > 뷔페', 'FD6', 12],
    ['음식점 > 한식뷔페', 'FD6', 12],
    ['', 'FD6', 12],
  ])('%s (%s) → %i', (name, group, expected) => {
    expect(categoryIdOf(name, group)).toBe(expected);
  });
});

describe('businessStatusOf — 영업 중 여부 (KST)', () => {
  const week = (intervals: { open: string; close: string }[]): BusinessHours => ({
    mon: intervals,
    tue: intervals,
    wed: intervals,
    thu: intervals,
    fri: intervals,
    sat: intervals,
    sun: intervals,
  });
  /** 2026-10-28(수) KST hh:mm */
  const at = (hhmm: string) => new Date(`2026-10-28T${hhmm}:00+09:00`);

  it('영업 구간 안이면 열림, 닫는 시각부터는 닫힘', () => {
    const hours = week([{ open: '11:00', close: '21:00' }]);
    expect(businessStatusOf(hours, at('10:59'))?.isOpen).toBe(false);
    expect(businessStatusOf(hours, at('11:00'))?.isOpen).toBe(true);
    expect(businessStatusOf(hours, at('20:59'))?.isOpen).toBe(true);
    expect(businessStatusOf(hours, at('21:00'))?.isOpen).toBe(false);
  });

  it('점심·저녁 따로 영업하면 첫 여는 시각과 마지막 닫는 시각', () => {
    const hours = week([
      { open: '11:00', close: '15:00' },
      { open: '17:00', close: '22:00' },
    ]);
    expect(businessStatusOf(hours, at('16:00'))).toEqual({
      isOpen: false,
      todayOpenTime: '11:00',
      todayCloseTime: '22:00',
    });
    expect(businessStatusOf(hours, at('18:00'))?.isOpen).toBe(true);
  });

  it('자정을 넘기는 구간은 다음 날 새벽까지 열림', () => {
    const hours: BusinessHours = { ...week([]), tue: [{ open: '18:00', close: '02:00' }] };
    // 수요일 01:30 = 화요일 밤 영업의 연장
    expect(businessStatusOf(hours, at('01:30'))).toEqual({
      isOpen: true,
      todayOpenTime: null,
      todayCloseTime: null,
    });
    expect(businessStatusOf(hours, at('02:00'))?.isOpen).toBe(false);
    const wedNight: BusinessHours = { ...week([]), wed: [{ open: '18:00', close: '02:00' }] };
    expect(businessStatusOf(wedNight, at('23:00'))?.isOpen).toBe(true);
  });

  it('24:00까지 영업', () => {
    const hours = week([{ open: '09:00', close: '24:00' }]);
    expect(businessStatusOf(hours, at('23:59'))?.isOpen).toBe(true);
  });

  it('영업시간이 없거나 형식이 틀리면 null', () => {
    expect(businessStatusOf(null)).toBeNull();
    expect(parseBusinessHours(null)).toBeNull();
    expect(parseBusinessHours({ mon: [{ open: '9:00', close: '21:00' }] })).toBeNull();
    expect(parseBusinessHours({ mon: [{ open: '25:00', close: '21:00' }] })).toBeNull();
    expect(parseBusinessHours('11:00~21:00')).toBeNull();
  });

  it('빠진 요일은 휴무(빈 배열)로 채운다', () => {
    expect(parseBusinessHours({ mon: [{ open: '11:00', close: '21:00' }] })).toEqual({
      mon: [{ open: '11:00', close: '21:00' }],
      tue: [],
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    });
  });
});
