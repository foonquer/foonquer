// 먹포인트 API (POINT-01)

import { api } from '../lib/api';

/** POINT-01 잔액과 이번 달 모은·쓴 포인트 */
export const getMyPoints = () =>
  api.get<{ pointBalance: number; monthEarned: number; monthSpent: number }>('/points/me');
