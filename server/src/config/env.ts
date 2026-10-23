import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('환경변수가 올바르지 않습니다. .env.example을 확인하세요.');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
