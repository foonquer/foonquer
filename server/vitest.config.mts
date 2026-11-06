import { defineConfig } from 'vitest/config';

// 테스트는 실제 MySQL의 테스트 전용 DB(이름이 _test로 끝나야 함)에 붙는다.
// 기본값은 README의 로컬 Docker MySQL(3307). 다른 DB를 쓰려면 TEST_DATABASE_URL을 지정한다.
const testEnv = {
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? 'mysql://root:password@localhost:3307/foonquer_test',
  JWT_ACCESS_SECRET: 'test-only-access-secret-0123456789abcdef',
  TRUST_PROXY: '0',
  COOKIE_SECURE: 'true',
  FRONTEND_URL: 'http://localhost:5173',
  API_BASE_URL: 'http://localhost:3000',
  MAIL_DRIVER: 'console',
  KAKAO_REST_API_KEY: 'test-kakao-rest-key',
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
};

// global-setup.ts(DB 준비)도 같은 값을 쓰도록 이 프로세스에도 넣는다. server/.env보다 우선한다.
Object.assign(process.env, testEnv);

export default defineConfig({
  test: {
    env: testEnv,
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // 테스트 파일들이 같은 DB를 쓰므로 한 파일씩 차례로 돌린다.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});
