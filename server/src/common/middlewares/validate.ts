import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../errors/app-error';
import { CommonError, findErrorCode } from '../errors/error-codes';

interface Schemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

interface ValidateOptions {
  /** 명세서에 VALIDATION_ERROR 문구가 따로 적힌 API만 쓴다. 예) '이메일과 비밀번호를 입력해 주세요.' */
  validationMessage?: string;
}

/**
 * 요청 검증. params → query → body 순서로 검사하고 첫 번째 오류로 응답한다.
 * - zod 에러 메시지 자리에 등록된 에러 코드 이름을 넣으면 그 코드로 응답한다.
 *   예) z.string({ error: 'EMAIL_REQUIRED' }).email({ error: 'INVALID_EMAIL_FORMAT' })
 * - 그 밖의 오류(필수 값 누락, 타입 오류)는 VALIDATION_ERROR로 응답하고, 어느 필드인지 data.field에 넣는다.
 * 통과하면 req.body / req.query / req.params가 검증·변환된 값으로 바뀐다.
 */
export function validate(schemas: Schemas, options: ValidateOptions = {}): RequestHandler {
  return (req, _res, next) => {
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key] ?? {});
      if (!result.success) {
        const issue = result.error.issues[0];
        const registered = issue ? findErrorCode(issue.message) : undefined;
        if (registered) {
          next(new AppError(registered));
          return;
        }
        const field = issue?.path.join('.') || null;
        next(
          new AppError(CommonError.VALIDATION_ERROR, options.validationMessage, {
            field,
            reason: issue?.message ?? null,
          }),
        );
        return;
      }
      // Express 5의 req.query는 getter라 직접 대입할 수 없어서 defineProperty로 바꾼다.
      Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true });
    }
    next();
  };
}
