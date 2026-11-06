// 서버 공통 응답 형식에 맞춘 API 호출 함수.
// 성공하면 data(와 message)를 돌려주고, 실패하면 서버의 code·message·data를 담은 ApiError를 던진다.
// 로그인한 상태면 Authorization 헤더를 붙이고, accessToken이 만료(TOKEN_EXPIRED)되면 한 번 재발급한 뒤 다시 보낸다.

import { API_PREFIX } from './config';
import { getAccessToken, refreshAccessToken, setNextAction, signOut } from './session';

type SuccessBody<T> = { success: true; data: T; message: string };
type ErrorBody = { success: false; code: string; message: string; data?: unknown };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** 에러에 딸린 값 (예: LOGIN_INVALID_CREDENTIALS의 failCount) */
  readonly data: unknown;

  constructor(status: number, code: string, message: string, data: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

/**
 * 이 코드로 401이 오면 다시 로그인해야 한다.
 * TOKEN_EXPIRED는 재발급이 실패했을 때 refreshAccessToken()이 이미 로그아웃시킨다
 * (서버에 닿지 않아 실패했으면 로그인 상태를 그대로 둔다).
 */
const SIGN_OUT_CODES = new Set(['TOKEN_REQUIRED', 'TOKEN_INVALID']);

export type Query = Record<string, string | number | boolean | null | undefined>;

type Options = { query?: Query; body?: unknown; signal?: AbortSignal };

export type ApiResult<T> = { data: T; message: string };

function urlOf(path: string, query?: Query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `${API_PREFIX}${path}${qs ? `?${qs}` : ''}`;
}

async function send(method: string, path: string, { query, body, signal }: Options) {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(urlOf(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError(0, 'NETWORK', '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
  }
  const json = (await res.json().catch(() => null)) as SuccessBody<unknown> | ErrorBody | null;
  return { res, json };
}

export async function request<T>(
  method: string,
  path: string,
  options: Options = {},
): Promise<ApiResult<T>> {
  let { res, json } = await send(method, path, options);

  if (json && !json.success && res.status === 401 && json.code === 'TOKEN_EXPIRED') {
    if (await refreshAccessToken()) ({ res, json } = await send(method, path, options));
  }

  if (!json) throw new ApiError(res.status, 'INVALID_RESPONSE', '서버 응답을 읽을 수 없어요.');
  if (!json.success) {
    if (res.status === 401 && SIGN_OUT_CODES.has(json.code)) signOut();
    // 다른 기기에서 상태가 바뀐 경우 등: 라우트 가드가 알맞은 화면으로 보낸다.
    if (json.code === 'TERMS_REQUIRED') setNextAction('TERMS_REQUIRED');
    if (json.code === 'PROFILE_REQUIRED') setNextAction('PROFILE_REQUIRED');
    throw new ApiError(res.status, json.code, json.message, json.data ?? null);
  }
  return { data: json.data as T, message: json.message };
}

/**
 * 예) const review = await api.post<Review>('/reviews', { taste: 5 });
 *     const { data, message } = await api.call<Result>('GET', '/search', { query: { keyword } });
 *     try { ... } catch (e) { if (e instanceof ApiError && e.code === 'TOKEN_EXPIRED') ... }
 */
export const api = {
  call: request,
  get: async <T>(path: string, query?: Query, signal?: AbortSignal) =>
    (await request<T>('GET', path, { query, signal })).data,
  post: async <T>(path: string, body?: unknown) => (await request<T>('POST', path, { body })).data,
  put: async <T>(path: string, body?: unknown) => (await request<T>('PUT', path, { body })).data,
  patch: async <T>(path: string, body?: unknown) =>
    (await request<T>('PATCH', path, { body })).data,
  delete: async <T>(path: string, body?: unknown) =>
    (await request<T>('DELETE', path, { body })).data,
};

/** 에러를 화면에 보여 줄 문구로 */
export function errorMessage(err: unknown) {
  return err instanceof ApiError ? err.message : '문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
}
