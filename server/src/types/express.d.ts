import type { AuthUser } from '../common/auth/require-auth';

declare global {
  namespace Express {
    interface Request {
      /** requireAuth()가 넣는 로그인 회원 정보 */
      auth?: AuthUser;
    }
  }
}

export {};
