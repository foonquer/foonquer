import type { Request } from 'express';

/** cookie-parser가 읽은 쿠키 값. 없거나 빈 값이면 null */
export function readCookie(req: Request, name: string): string | null {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
