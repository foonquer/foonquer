import type { ErrorCodeDef } from './error-codes';

/**
 * 서비스·라우터에서 던지는 에러. 에러 핸들러가 { success: false, code, message, data }로 바꿔 응답한다.
 * 예) throw new AppError(AuthError.TOKEN_EXPIRED)
 *     throw new AppError(UserError.INVALID_NICKNAME, '닉네임은 2~10자입니다.')   // 메시지만 바꾸기
 *     throw new AppError(AuthError.LOGIN_LOCKED, undefined, { lockedUntil })   // 화면에 필요한 값은 data로
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  /** 화면에 추가 정보가 필요한 에러만 객체를 넣는다. 보통 null */
  readonly data: unknown;

  constructor(errorCode: ErrorCodeDef, message?: string, data?: unknown) {
    super(message ?? errorCode.message);
    this.name = 'AppError';
    this.status = errorCode.status;
    this.code = errorCode.code;
    this.data = data ?? null;
  }
}
