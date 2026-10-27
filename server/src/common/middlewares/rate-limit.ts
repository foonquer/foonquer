import { MemoryStore, rateLimit as expressRateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error';
import { CommonError, type ErrorCodeDef } from '../errors/error-codes';

interface RateLimitOptions {
  /** 횟수를 세는 시간(ms) */
  windowMs: number;
  /** windowMs 안에 허용하는 요청 수. 넘으면 429 */
  limit: number;
  /** 넘었을 때 응답할 에러. 기본 TOO_MANY_REQUESTS */
  error?: ErrorCodeDef;
}

// 테스트에서 매번 횟수를 비우려고 만든 store를 모아 둔다.
const stores: MemoryStore[] = [];
const resettables: (() => void)[] = [];

/** 메모리에 횟수를 세는 다른 곳(RecentEvents 등)도 resetRateLimits()로 함께 비우게 등록한다 */
export function registerResettable(reset: () => void) {
  resettables.push(reset);
}

/**
 * 같은 IP의 요청 횟수 제한. 서버 1대(메모리 저장) 기준이다.
 * 예) router.get('/email/availability', rateLimit({ windowMs: 60_000, limit: 30 }), handler)
 * 서버 앞에 프록시가 있으면 TRUST_PROXY 환경변수를 맞춰야 실제 사용자 IP로 센다.
 */
export function rateLimit({ windowMs, limit, error }: RateLimitOptions): RequestHandler {
  const store = new MemoryStore();
  stores.push(store);
  return expressRateLimit({
    windowMs,
    limit,
    store,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(error ?? CommonError.TOO_MANY_REQUESTS)),
  });
}

/** 테스트 전용: 모든 요청 횟수 기록을 지운다 */
export async function resetRateLimits() {
  await Promise.all(stores.map((store) => store.resetAll()));
  for (const reset of resettables) reset();
}
