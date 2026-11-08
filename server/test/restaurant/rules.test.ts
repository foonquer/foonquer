import { describe, expect, it } from 'vitest';
import {
  type BusinessHours,
  businessStatusOf,
  parseBusinessHours,
} from '../../src/modules/restaurant/business-hours';
import { categoryIdOfIndustry } from '../../src/modules/restaurant/category';

describe('categoryIdOfIndustry — 공공데이터 상권업종 소분류 → 우리 카테고리 12개', () => {
  it.each([
    ['I20105', '국수/칼국수', 1],
    ['I20199', '기타 한식 음식점', 1],
    ['I20107', '돼지고기 구이/찜', 6],
    ['I20103', '족발/보쌈', 6],
    ['I20111', '횟집', 7],
    ['I20201', '중국집', 2],
    ['I20301', '일식 회/초밥', 3],
    ['I20402', '파스타/스테이크', 4],
    ['I21003', '피자', 4],
    ['I21007', '김밥/만두/분식', 5],
    ['I21006', '치킨', 8],
    ['I21004', '버거', 9],
    ['I20501', '베트남식 전문', 10],
    ['I21201', '카페', 11],
    ['I21001', '빵/도넛', 11],
    ['I21104', '요리 주점', 12],
    ['I20702', '뷔페', 12],
    ['I20601', '분류 안된 외국식 음식점', 12],
    ['', '', 12],
  ])('%s %s → %i', (code, _name, expected) => {
    expect(categoryIdOfIndustry(code)).toBe(expected);
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
