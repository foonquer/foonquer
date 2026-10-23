import type { ErrorCodeDef } from './error-codes';

/**
 * 서비스·라우터에서 던지는 에러. 에러 핸들러가 { success: false, code, message }로 바꿔 응답한다.
 * 예) throw new AppError(AuthError.UNAUTHORIZED)
 *     throw new AppError(CommonError.BAD_REQUEST, '닉네임은 2~10자입니다.')
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(errorCode: ErrorCodeDef, message?: string) {
    super(message ?? errorCode.message);
    this.name = 'AppError';
    this.status = errorCode.status;
    this.code = errorCode.code;
  }
}
