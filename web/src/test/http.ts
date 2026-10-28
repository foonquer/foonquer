// 테스트용 가짜 서버. fetch를 바꿔 끼워 "METHOD /경로" 별로 응답을 정한다.
// 예) const server = mockApi({ 'GET /users/me': ok(me), 'POST /auth/login': fail(401, 'LOGIN_INVALID_CREDENTIALS') });
//     server.calls('POST /auth/login')[0].body

import { vi } from 'vitest';

type Reply = { status: number; body: unknown };
type Call = {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Headers;
};
type Handler = Reply | ((call: Call) => Reply | Promise<Reply>);

export const ok = (data: unknown, message = '요청에 성공했어요.'): Reply => ({
  status: 200,
  body: { success: true, data, message },
});

export const fail = (
  status: number,
  code: string,
  message = '에러',
  data: unknown = null,
): Reply => ({
  status,
  body: { success: false, code, message, data },
});

/** "/restaurants/:id" 같은 경로 패턴을 정규식으로 */
function patternOf(path: string) {
  return new RegExp(`^${path.replace(/:[^/]+/g, '[^/]+')}$`);
}

export function mockApi(handlers: Record<string, Handler>) {
  const log: Call[] = [];
  const routes = Object.entries(handlers).map(([key, handler]) => {
    const [method, path] = key.split(' ');
    return { method, pattern: patternOf(path), handler };
  });

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    const call: Call = {
      method: init.method ?? 'GET',
      path: url.pathname.replace(/^\/api\/v1/, ''),
      query: url.searchParams,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: new Headers(init.headers),
    };
    log.push(call);

    const route = routes.find((r) => r.method === call.method && r.pattern.test(call.path));
    const reply = route
      ? typeof route.handler === 'function'
        ? await route.handler(call)
        : route.handler
      : fail(404, 'NOT_MOCKED', `${call.method} ${call.path}`);
    // 문자열 본문은 그대로 보낸다 (HTML 오류 페이지 등 JSON이 아닌 응답)
    const body = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body);
    return new Response(body, { status: reply.status });
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    fetch: fetchMock,
    /** "METHOD /경로"로 들어온 요청들 (경로 패턴 가능) */
    calls(key: string) {
      const [method, path] = key.split(' ');
      const pattern = patternOf(path);
      return log.filter((c) => c.method === method && pattern.test(c.path));
    },
  };
}
