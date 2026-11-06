import { useCallback, useEffect, useState } from 'react';

/**
 * 남은 초를 1초마다 줄인다 (인증 코드 유효 시간, 다시 보내기 대기 시간).
 * start(초)로 시작하고, 0이 되면 멈춘다.
 */
export function useCountdown() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  const start = useCallback((seconds: number) => {
    const current = Date.now();
    setNow(current);
    setEndsAt(current + seconds * 1000);
  }, []);

  const stop = useCallback(() => setEndsAt(null), []);

  const remaining = endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
  return { remaining, running: remaining > 0, started: endsAt !== null, start, stop };
}
