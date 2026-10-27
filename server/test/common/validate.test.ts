import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineErrors } from '../../src/common/errors/error-codes';
import { errorHandler } from '../../src/common/middlewares/error-handler';
import { validate } from '../../src/common/middlewares/validate';
import { ok } from '../../src/common/response';

defineErrors({
  SAMPLE_EMAIL_REQUIRED: {
    status: 400,
    code: 'SAMPLE_EMAIL_REQUIRED',
    message: '이메일을 입력해 주세요.',
  },
  SAMPLE_EMAIL_FORMAT: {
    status: 400,
    code: 'SAMPLE_EMAIL_FORMAT',
    message: '이메일 형식이 올바르지 않아요.',
  },
});

const bodySchema = z.object({
  email: z.string({ error: 'SAMPLE_EMAIL_REQUIRED' }).email({ error: 'SAMPLE_EMAIL_FORMAT' }),
  age: z.number().int(),
});

function buildApp(options?: Parameters<typeof validate>[1]) {
  const app = express();
  app.use(express.json());
  app.post('/sample', validate({ body: bodySchema }, options), (req, res) => {
    ok(res, req.body);
  });
  app.get(
    '/items/:id',
    validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
    (req, res) => {
      ok(res, req.params);
    },
  );
  app.use(errorHandler);
  return app;
}

describe('validate()', () => {
  it('zod 메시지에 넣은 등록된 에러 코드로 응답한다', async () => {
    const app = buildApp();

    const missing = await request(app).post('/sample').send({ age: 1 });
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({
      success: false,
      code: 'SAMPLE_EMAIL_REQUIRED',
      message: '이메일을 입력해 주세요.',
      data: null,
    });

    const format = await request(app).post('/sample').send({ email: 'nope', age: 1 });
    expect(format.body.code).toBe('SAMPLE_EMAIL_FORMAT');
  });

  it('그 밖의 오류는 VALIDATION_ERROR와 필드 이름을 준다', async () => {
    const res = await request(buildApp()).post('/sample').send({ email: 'a@b.com', age: 'x' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toBe('입력값이 올바르지 않아요.');
    expect(res.body.data.field).toBe('age');
  });

  it('명세에 따로 적힌 VALIDATION_ERROR 문구를 쓸 수 있다', async () => {
    const app = buildApp({ validationMessage: '나이를 숫자로 입력해 주세요.' });
    const res = await request(app).post('/sample').send({ email: 'a@b.com' });

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toBe('나이를 숫자로 입력해 주세요.');
  });

  it('통과하면 변환된 값으로 바뀐다', async () => {
    const res = await request(buildApp()).get('/items/12');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 12 });
  });

  it('본문이 없어도 필수 값 오류로 응답한다', async () => {
    const res = await request(buildApp()).post('/sample');

    expect(res.body.code).toBe('SAMPLE_EMAIL_REQUIRED');
  });
});

describe('defineErrors()', () => {
  it('같은 코드를 다른 상태 코드로 정의하면 에러를 던진다', () => {
    expect(() =>
      defineErrors({
        SAMPLE_EMAIL_REQUIRED: {
          status: 422,
          code: 'SAMPLE_EMAIL_REQUIRED',
          message: '다른 상태',
        },
      }),
    ).toThrow();
  });
});
