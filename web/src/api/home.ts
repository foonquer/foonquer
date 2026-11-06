// 홈 상단 API (HOME-01)

import { api } from '../lib/api';
import type { MyMukkaebi } from './mukkaebi';
import type { Season, Tier } from './ranking';

/** HOME-01 홈 상단: 먹깨비·대표 칭호·시즌·대표 구 순위·안 읽은 알림·축하 수 */
export type HomeSummary = {
  mukkaebi: Pick<MyMukkaebi, 'level' | 'stage' | 'stageName' | 'equipped'>;
  /** 대표 칭호 (없으면 null) */
  title: string | null;
  season: Season | null;
  rank: {
    conquestCount: number;
    main: {
      sigunguId: number;
      sigunguName: string;
      conquestCount: number;
      rank: number | null;
      tier: Tier;
      tierTitle: string;
    } | null;
  };
  unreadNotificationCount: number;
  celebrationCount: number;
};
export const getHomeSummary = () => api.get<HomeSummary>('/home/summary');
