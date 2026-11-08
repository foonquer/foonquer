import type { BusinessStatus } from '../../api/restaurants';

// 닫혀 있을 때 여는 시각 전인지, 점심·저녁 사이 쉬는 시간인지, 닫은 뒤인지는 응답만으로 알 수 없어
// 셋 모두에 맞는 "영업시간 외"로 쓴다.

/** 미리보기·목록용 짧은 영업 상태: "영업 중 · 21:30까지" / "영업시간 외" (영업시간을 모르면 null) */
export function businessText(status: BusinessStatus | null) {
  if (!status) return null;
  if (status.isOpen)
    return status.todayCloseTime ? `영업 중 · ${status.todayCloseTime}까지` : '영업 중';
  return status.todayOpenTime ? '영업시간 외' : '오늘 휴무';
}

/** 상세용: "영업 중 · 11:00–21:00" (영업시간을 모르면 null — 줄을 숨긴다) */
export function businessLine(status: BusinessStatus | null) {
  if (!status) return null;
  const hours =
    status.todayOpenTime && status.todayCloseTime
      ? `${status.todayOpenTime}–${status.todayCloseTime}`
      : null;
  if (!hours) return status.isOpen ? '영업 중' : '오늘 휴무';
  return `${status.isOpen ? '영업 중' : '영업시간 외'} · ${hours}`;
}
