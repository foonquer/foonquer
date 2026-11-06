import 'dotenv/config';
import { z } from 'zod';

/** 'true' / 'false' 문자열을 boolean으로 */
const booleanString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/** .env에 `KEY=`처럼 비워 둔 값은 없는 값(undefined)으로 본다 */
function blankAsUndefined<T extends z.ZodType>(schema: T) {
  return z.preprocess((v) => (v === '' ? undefined : v), schema);
}

const envSchema = z
  .object({
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

    /** 웹(프론트) 주소. 카카오 로그인 콜백에 쓴다. 끝에 / 없이 */
    FRONTEND_URL: z
      .url()
      .default('http://localhost:5173')
      .transform((v) => v.replace(/\/+$/, '')),
    /** 이 API 서버의 바깥 주소. 카카오 로그인 redirect_uri({API_BASE_URL}/api/v1/auth/oauth/kakao/callback)에 쓴다 */
    API_BASE_URL: z
      .url()
      .default('http://localhost:3000')
      .transform((v) => v.replace(/\/+$/, '')),
    /** 카카오 REST API 키 (카카오 로그인 client_id, 로컬 API 호출에 같이 쓴다) */
    KAKAO_REST_API_KEY: blankAsUndefined(z.string().optional()),
    /** 카카오 로그인 보안의 Client Secret을 켰을 때만 */
    KAKAO_CLIENT_SECRET: blankAsUndefined(z.string().optional()),
    /** 사진·영수증을 두는 Cloud Storage 버킷 이름. 비우면 올린 사진을 확인할 수 없어 사진 key를 받지 않는다 */
    GCS_BUCKET: blankAsUndefined(z.string().optional()),
    /** 영수증·현장·문의 사진을 두는 비공개 Cloud Storage 버킷 (UPLOAD-01). 비우면 그 사진들의 업로드 URL을 만들 수 없다 */
    GCS_PRIVATE_BUCKET: blankAsUndefined(z.string().optional()),
    /** 네이버 CLOVA OCR 영수증 특화 모델 APIGW Invoke URL (VISIT-03). 비우면 영수증을 읽지 못해 인증이 UNREADABLE로 실패한다 */
    CLOVA_OCR_URL: blankAsUndefined(z.url().optional()),
    /** CLOVA OCR Secret Key (X-OCR-SECRET 헤더) */
    CLOVA_OCR_SECRET: blankAsUndefined(z.string().optional()),
    /** Gemini API 키 (리뷰 글 AI 분석, 주기 작업 review-ai). 비우면 분석하지 않는다 */
    GEMINI_API_KEY: blankAsUndefined(z.string().optional()),
    /** 리뷰 분석에 쓰는 Gemini 모델 (https://ai.google.dev/gemini-api/docs/models) */
    GEMINI_MODEL: blankAsUndefined(z.string().default('gemini-3.5-flash-lite')),
    /** 프로필·리뷰 사진 공개 주소. 예) https://storage.googleapis.com/버킷 또는 Cloud CDN 도메인 — 비우면 사진 URL을 null로 준다 */
    IMAGE_BASE_URL: blankAsUndefined(
      z
        .url()
        .optional()
        .transform((v) => v?.replace(/\/+$/, '')),
    ),
  })
  // 영수증·현장·문의 사진이 공개 읽기 버킷에 들어가지 않게 한다
  .refine((e) => !e.GCS_PRIVATE_BUCKET || e.GCS_PRIVATE_BUCKET !== e.GCS_BUCKET, {
    path: ['GCS_PRIVATE_BUCKET'],
    error: 'GCS_PRIVATE_BUCKET은 GCS_BUCKET(공개 버킷)과 다른 버킷이어야 합니다.',
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
