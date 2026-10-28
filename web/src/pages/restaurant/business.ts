import type { BusinessStatus } from '../../api/restaurants';

/** 미리보기·목록용 짧은 영업 상태: "영업 중 · 21:30까지" / "영업 종료" (영업시간을 모르면 null) */
export function businessText(status: BusinessStatus | null) {
  if (!status) return null;
  if (status.isOpen)
    return status.todayCloseTime ? `영업 중 · ${status.todayCloseTime}까지` : '영업 중';
  return status.todayOpenTime ? '영업 종료' : '오늘 휴무';
}

/** 상세용: "영업 중 · 11:00–21:00" */
export function businessLine(status: BusinessStatus | null) {
  if (!status) return '영업시간 정보가 아직 없어요';
  const hours =
    status.todayOpenTime && status.todayCloseTime
      ? `${status.todayOpenTime}–${status.todayCloseTime}`
      : null;
  if (!hours) return status.isOpen ? '영업 중' : '오늘 휴무';
  return `${status.isOpen ? '영업 중' : '영업 종료'} · ${hours}`;
}
