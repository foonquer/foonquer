import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors/app-error';
import { CommonError } from '../errors/error-codes';
import type { ErrorBody } from '../response';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError(CommonError.NOT_FOUND));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    const body: ErrorBody = { success: false, code: err.code, message: err.message };
    res.status(err.status).json(body);
    return;
  }

  // express.json()이 JSON을 읽지 못했을 때
  if (err instanceof SyntaxError && 'type' in err && err.type === 'entity.parse.failed') {
    const { status, code } = CommonError.BAD_REQUEST;
    const body: ErrorBody = { success: false, code, message: 'JSON 형식이 올바르지 않습니다.' };
    res.status(status).json(body);
    return;
  }

  console.error(err);
  const { status, code, message } = CommonError.INTERNAL;
  const body: ErrorBody = { success: false, code, message };
  res.status(status).json(body);
};
