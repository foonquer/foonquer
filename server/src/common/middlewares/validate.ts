import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../errors/app-error';
import { CommonError } from '../errors/error-codes';

interface Schemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

/**
 * 요청 검증. 실패하면 COMMON_001과 첫 번째 오류 메시지로 응답한다.
 * 예) router.post('/', validate({ body: createReviewSchema }), handler)
 * 통과하면 req.body / req.query / req.params가 검증·변환된 값으로 바뀐다.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue?.path.join('.');
        const message = path ? `${path}: ${issue.message}` : (issue?.message ?? undefined);
        next(new AppError(CommonError.BAD_REQUEST, message));
        return;
      }
      // Express 5의 req.query는 getter라 직접 대입할 수 없어서 defineProperty로 바꾼다.
      Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true });
    }
    next();
  };
}
