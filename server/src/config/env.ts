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

  /** 웹(프론트) 주소. 비밀번호 재설정 메일 링크, 소셜 로그인 콜백에 쓴다. 끝에 / 없이 */
  FRONTEND_URL: z
    .url()
    .default('http://localhost:5173')
    .transform((v) => v.replace(/\/+$/, '')),
  /** 메일 발송 방식. console = 메일 대신 서버 로그에 출력(개발용), ses = AWS SES로 발송 */
  MAIL_DRIVER: z.enum(['console', 'ses']).default('console'),
  /** 보내는 사람 주소 (SES에서 인증한 도메인·주소). MAIL_DRIVER=ses면 필수 */
  MAIL_FROM: z.string().optional(),
  AWS_REGION: z.string().default('ap-northeast-2'),
  /** 이 API 서버의 바깥 주소. 소셜 로그인 redirect_uri({API_BASE_URL}/api/v1/auth/oauth/{provider}/callback)에 쓴다 */
  API_BASE_URL: z
    .url()
    .default('http://localhost:3000')
    .transform((v) => v.replace(/\/+$/, '')),
  /** 카카오 REST API 키 (카카오 로그인 client_id, 로컬 API 호출에 같이 쓴다) */
  KAKAO_REST_API_KEY: z.string().optional(),
  /** 카카오 로그인 보안의 Client Secret을 켰을 때만 */
  KAKAO_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** 사진·영수증을 두는 S3 버킷 이름. 비우면 올린 사진을 확인할 수 없어 사진 key를 받지 않는다 */
  AWS_S3_BUCKET: z.string().optional(),
  /** 프로필·리뷰 사진 공개 주소(CloudFront). 예) https://img.example.com — 비우면 사진 URL을 null로 준다 */
  IMAGE_BASE_URL: z
    .url()
    .optional()
    .transform((v) => v?.replace(/\/+$/, '')),
});

const parsed = envSchema
  .refine((e) => e.MAIL_DRIVER !== 'ses' || !!e.MAIL_FROM, {
    message: 'MAIL_DRIVER=ses이면 MAIL_FROM이 필요합니다.',
    path: ['MAIL_FROM'],
  })
  .safeParse(process.env);

if (!parsed.success) {
  console.error('환경변수가 올바르지 않습니다. .env.example을 확인하세요.');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  COOKIE_SECURE: parsed.data.COOKIE_SECURE ?? true,
};
