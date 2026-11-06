import { registerResettable } from './middlewares/rate-limit';

/**
 * 키(이메일, 회원 id 등)별로 최근 일어난 일의 시각을 메모리에 모아 횟수를 센다.
 * IP 기준이 아닌 횟수 제한(같은 이메일 1시간 5회, 비밀번호 5번 틀림 등)에 쓴다. 서버 1대 기준이다.
 */
export class RecentEvents {
  private readonly events = new Map<string, number[]>();

  /** @param keepMs 이 시간이 지난 기록은 버린다 (가장 긴 확인 기간 이상으로) */
  constructor(private readonly keepMs: number) {
    registerResettable(() => this.events.clear());
  }

  private prune(key: string, now: number) {
    const list = (this.events.get(key) ?? []).filter((t) => now - t < this.keepMs);
    if (list.length > 0) this.events.set(key, list);
    else this.events.delete(key);
    return list;
  }

  record(key: string, now = Date.now()) {
    const list = this.prune(key, now);
    list.push(now);
    this.events.set(key, list);
  }

  /** windowMs 안에 일어난 횟수 */
  count(key: string, windowMs: number, now = Date.now()) {
    return this.prune(key, now).filter((t) => now - t < windowMs).length;
  }

  /** windowMs 안의 기록 중 가장 오래된 시각 (없으면 null) */
  oldest(key: string, windowMs: number, now = Date.now()) {
    const inWindow = this.prune(key, now).filter((t) => now - t < windowMs);
    return inWindow.length > 0 ? Math.min(...inWindow) : null;
  }

  /** 가장 최근 시각 (없으면 null) */
  latest(key: string, now = Date.now()) {
    const list = this.prune(key, now);
    return list.length > 0 ? Math.max(...list) : null;
  }

  clear(key: string) {
    this.events.delete(key);
  }
}
