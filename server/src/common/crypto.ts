import { createHash, randomBytes, randomInt } from 'node:crypto';

/** 토큰을 DB에 저장할 때 쓰는 SHA-256 (64자리 16진수) */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** URL·쿠키에 그대로 쓸 수 있는 임의 토큰 (기본 32바이트 → 43자) */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** 앞자리 0을 살린 숫자 코드. 예) '048213' */
export function randomDigits(length: number): string {
  let code = '';
  for (let i = 0; i < length; i += 1) code += String(randomInt(0, 10));
  return code;
}
