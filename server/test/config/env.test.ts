import { afterEach, describe, expect, it, vi } from 'vitest';

/** 환경변수를 바꿔 env.ts를 새로 읽는다. 값이 틀리면 env.ts가 process.exit(1)을 부른다 */
async function loadEnv(values: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit');
  });
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
  it('.env에 비워 둔 선택 값(IMAGE_BASE_URL, KAKAO_CLIENT_SECRET)은 없는 값으로 본다', async () => {
    const { env } = await loadEnv({ IMAGE_BASE_URL: '', KAKAO_CLIENT_SECRET: '' });

    expect(env?.IMAGE_BASE_URL).toBeUndefined();
    expect(env?.KAKAO_CLIENT_SECRET).toBeUndefined();
  });

  it('IMAGE_BASE_URL 끝의 /는 뗀다', async () => {
    const { env } = await loadEnv({ IMAGE_BASE_URL: 'https://img.example.com/' });

    expect(env?.IMAGE_BASE_URL).toBe('https://img.example.com');
  });

  it('필수 값(JWT_ACCESS_SECRET)이 짧으면 서버를 시작하지 않는다', async () => {
    const result = await loadEnv({ JWT_ACCESS_SECRET: 'short' });

    expect(result.exited).toBe(true);
  });
});
