export interface ErrorCodeDef {
  status: number;
  code: string;
  message: string;
}

// 도메인마다 접두어를 쓴다: COMMON_, AUTH_, USER_, RESTAURANT_, VISIT_, REVIEW_, RANK_ ...
// 새 도메인 에러는 각자 모듈 폴더에 같은 모양으로 만든다 (예: src/modules/review/review.errors.ts).

export const CommonError = {
  BAD_REQUEST: { status: 400, code: 'COMMON_001', message: '잘못된 요청입니다.' },
  NOT_FOUND: { status: 404, code: 'COMMON_002', message: '요청한 경로를 찾을 수 없습니다.' },
  INTERNAL: { status: 500, code: 'COMMON_500', message: '서버 오류가 발생했습니다.' },
} as const satisfies Record<string, ErrorCodeDef>;

export const AuthError = {
  UNAUTHORIZED: { status: 401, code: 'AUTH_001', message: '로그인이 필요합니다.' },
  FORBIDDEN: { status: 403, code: 'AUTH_002', message: '권한이 없습니다.' },
} as const satisfies Record<string, ErrorCodeDef>;
