import 'dotenv/config';
import { z } from 'zod';

/** 'true' / 'false' 문자열을 boolean으로 */
const booleanString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z.string().default(''),

  /** accessToken(JWT) 서명 키. 32자 이상 임의 문자열 */
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET은 32자 이상이어야 합니다.'),
  /**
   * 서버 앞에 프록시(nginx, 로드밸런서, Cloudflare)가 있으면 그 단계 수. 요청 횟수 제한이 실제 사용자 IP를 보게 한다.
   * 0이면 프록시를 믿지 않는다.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /** 쿠키 Secure 속성. 기본 true (http://localhost에서도 브라우저가 받아 준다) */
  COOKIE_SECURE: booleanString,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('환경변수가 올바르지 않습니다. .env.example을 확인하세요.');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  COOKIE_SECURE: parsed.data.COOKIE_SECURE ?? true,
};
