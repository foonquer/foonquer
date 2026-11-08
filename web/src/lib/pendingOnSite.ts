// 위치 확인을 마치고 음식 사진은 아직 안 올린 현장인증 (이 브라우저에만).
// 가게에서 위치를 확인하고 다 먹은 뒤 다시 들어와 사진부터 올릴 수 있게 한다. 서버는 2시간 동안 받아 준다

import type { Coords } from './geolocation';
import { sessionOwner } from './session';
import { readJson, writeJson } from './storage';

export type PendingCheck = {
  verificationId: number;
  distanceM: number;
  allowedM: number;
  /** 이때까지 사진을 올려야 한다 (KST ISO) */
  expiresAt: string;
  me: Coords;
};

type Saved = { owner: string; restaurantId: number; restaurantName: string; check: PendingCheck };

const KEY = 'mk:pending-onsite';

export const pendingOnSite = {
  /** 지금 로그인한 회원의 아직 유효한 위치 확인. 없거나 지났으면 null */
  get(): Omit<Saved, 'owner'> | null {
    const saved = readJson<Saved | null>(KEY, null);
    if (!saved?.check?.expiresAt || saved.owner !== sessionOwner()) return null;
    if (!(Date.parse(saved.check.expiresAt) > Date.now())) {
      this.clear();
      return null;
    }
    return saved;
  },
  save(restaurantId: number, restaurantName: string, check: PendingCheck) {
    writeJson(KEY, { owner: sessionOwner(), restaurantId, restaurantName, check } satisfies Saved);
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // 지우지 못해도 만료 시각이 지나면 쓰지 않는다
    }
  },
};
