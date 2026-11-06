// 서버 공통 응답 형식에 맞춘 API 호출 함수.
// 성공하면 data만 돌려주고, 실패하면 서버의 code·message를 담은 ApiError를 던진다.

type SuccessBody<T> = { success: true; data: T; message: string };
type ErrorBody = { success: false; code: string; message: string };

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/v1${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', '서버에 연결할 수 없습니다.');
  }

  const json = (await res.json().catch(() => null)) as SuccessBody<T> | ErrorBody | null;
  if (!json) throw new ApiError(res.status, 'INVALID_RESPONSE', '서버 응답을 읽을 수 없습니다.');
  if (!json.success) throw new ApiError(res.status, json.code, json.message);
  return json.data;
}

/**
 * 예) const review = await api.post<Review>('/reviews', { taste: 5 });
 *     try { ... } catch (e) { if (e instanceof ApiError && e.code === 'TOKEN_EXPIRED') ... }
 */
export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
