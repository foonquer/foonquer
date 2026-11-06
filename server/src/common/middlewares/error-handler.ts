import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors/app-error';
import { CommonError, type ErrorCodeDef } from '../errors/error-codes';
import type { ErrorBody } from '../response';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError(CommonError.NOT_FOUND, '요청한 경로를 찾을 수 없어요.'));
};

function send(
  res: Parameters<ErrorRequestHandler>[2],
  def: ErrorCodeDef,
  message?: string,
  data?: unknown,
) {
  const body: ErrorBody = {
    success: false,
    code: def.code,
    message: message ?? def.message,
    data: data ?? null,
  };
  res.status(def.status).json(body);
}

/** body-parser(express.json)가 던지는 에러인지 */
function isBodyParserError(err: unknown): err is Error & { type: string } {
  return err instanceof Error && 'type' in err && typeof err.type === 'string';
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    const body: ErrorBody = {
      success: false,
      code: err.code,
      message: err.message,
      data: err.data,
    };
    res.status(err.status).json(body);
    return;
  }

  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      send(res, CommonError.VALIDATION_ERROR, 'JSON 형식이 올바르지 않아요.');
      return;
    }
    if (err.type === 'entity.too.large') {
      send(res, CommonError.VALIDATION_ERROR, '요청 내용이 너무 커요.');
      return;
    }
  }

  console.error(err);
  send(res, CommonError.INTERNAL_SERVER_ERROR);
};
