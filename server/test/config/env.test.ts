import { afterEach, describe, expect, it, vi } from 'vitest';

/** 환경변수를 바꿔 env.ts를 새로 읽는다. 값이 틀리면 env.ts가 process.exit(1)을 부른다 */
async function loadEnv(values: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit');
  }) as never);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const { env } = await import('../../src/config/env.js');
    return { env, exited: false };
  } catch {
    return { env: null, exited: exit.mock.calls.length > 0 };
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('환경변수 (config/env.ts)', () => {
  it('.env에 비워 둔 선택 값(IMAGE_BASE_URL, MAIL_FROM)은 없는 값으로 본다', async () => {
    const { env } = await loadEnv({ IMAGE_BASE_URL: '', MAIL_FROM: '' });

    expect(env?.IMAGE_BASE_URL).toBeUndefined();
    expect(env?.MAIL_FROM).toBeUndefined();
  });

  it('IMAGE_BASE_URL 끝의 /는 뗀다', async () => {
    const { env } = await loadEnv({ IMAGE_BASE_URL: 'https://img.example.com/' });

    expect(env?.IMAGE_BASE_URL).toBe('https://img.example.com');
  });

  it('운영(NODE_ENV=production)에서 MAIL_DRIVER가 console이면 서버를 시작하지 않는다', async () => {
    const result = await loadEnv({ NODE_ENV: 'production', MAIL_DRIVER: 'console' });

    expect(result.exited).toBe(true);
  });
});
