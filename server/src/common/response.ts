import type { Response } from 'express';

export interface SuccessBody<T> {
  success: true;
  data: T;
  message: string;
}

export interface ErrorBody {
  success: false;
  code: string;
  message: string;
  /** 보통 null. 화면에 추가 정보가 필요한 에러(로그인 실패 횟수 등)만 객체 */
  data: unknown;
}

/** 성공 응답: { success: true, data, message } */
export function ok<T>(
  res: Response,
  data: T,
  message = '요청이 성공적으로 처리되었습니다.',
  status = 200,
) {
  const body: SuccessBody<T> = { success: true, data, message };
  return res.status(status).json(body);
}

/** 생성 응답(201) */
export function created<T>(res: Response, data: T, message = '생성되었습니다.') {
  return ok(res, data, message, 201);
}
