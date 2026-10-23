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
}

/** 성공 응답: { success: true, data, message } */
export function ok<T>(res: Response, data: T, message = '요청에 성공했습니다.', status = 200) {
  const body: SuccessBody<T> = { success: true, data, message };
  return res.status(status).json(body);
}

/** 생성 응답(201) */
export function created<T>(res: Response, data: T, message = '생성되었습니다.') {
  return ok(res, data, message, 201);
}
