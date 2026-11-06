import { registerResettable } from './middlewares/rate-limit';

/**
 * 정해진 시간 동안만 값을 기억하는 메모리 캐시 (서버 1대 기준).
 * 카카오 로컬 API 호출 결과를 24시간 재사용해 하루 호출 한도를 아끼는 데 쓴다 (MAP-01, SEARCH-02).
 * 항목이 maxEntries를 넘으면 가장 먼저 넣은 것부터 버린다.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 10_000,
  ) {
    registerResettable(() => this.entries.clear());
  }

  get(key: string, now = Date.now()): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V, now = Date.now()) {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
