import type { Response } from 'supertest';

/** 응답의 Set-Cookie에서 refreshToken 값을 꺼낸다. 없으면 null */
export function refreshCookieOf(res: Response): string | null {
  const raw = res.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  const found = cookies.find((c) => c.startsWith('refreshToken='));
  if (!found) return null;
  return decodeURIComponent(found.split(';')[0].slice('refreshToken='.length));
}

/** refreshToken Set-Cookie 한 줄 전체 (속성 확인용) */
export function refreshCookieHeader(res: Response): string | null {
  const raw = res.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  return cookies.find((c) => c.startsWith('refreshToken=')) ?? null;
}
