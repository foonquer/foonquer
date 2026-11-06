export interface ErrorCodeDef {
  status: number;
  code: string;
  message: string;
}

// 에러 코드 이름은 API 명세서(노션)의 Error 항목에 적힌 이름을 그대로 쓴다. (예: EMAIL_REQUIRED, REGION_NOT_FOUND)
// 도메인 에러는 각자 모듈 폴더에 defineErrors()로 만든다. (예: src/modules/review/review.errors.ts)

const registry = new Map<string, ErrorCodeDef>();

/**
 * 에러 코드 묶음을 만든다. 여기서 만든 코드는 zod 스키마의 에러 메시지 자리에 코드 이름을 넣으면
 * validate()가 그 코드로 응답한다. 예) z.string({ error: 'EMAIL_REQUIRED' })
 * 같은 코드를 다른 HTTP 상태로 두 번 정의하면 서버가 시작할 때 바로 알 수 있게 에러를 던진다.
 */
export function defineErrors<const T extends Record<string, ErrorCodeDef>>(errors: T): T {
  for (const def of Object.values(errors)) {
    const prev = registry.get(def.code);
    if (prev && prev.status !== def.status) {
      throw new Error(
        `에러 코드 ${def.code}가 서로 다른 상태 코드(${prev.status}, ${def.status})로 정의되었습니다.`,
      );
    }
    if (!prev) registry.set(def.code, def);
  }
  return errors;
}

/** 등록된 에러 코드를 이름으로 찾는다. 없으면 undefined */
export function findErrorCode(code: string): ErrorCodeDef | undefined {
  return registry.get(code);
}

/** 명세서 "공통 Error Code" */
export const CommonError = defineErrors({
  VALIDATION_ERROR: { status: 400, code: 'VALIDATION_ERROR', message: '입력값이 올바르지 않아요.' },
  FORBIDDEN: { status: 403, code: 'FORBIDDEN', message: '권한이 없어요.' },
  NOT_FOUND: { status: 404, code: 'NOT_FOUND', message: '요청한 대상을 찾을 수 없어요.' },
  CONFLICT: { status: 409, code: 'CONFLICT', message: '요청이 현재 상태와 맞지 않아요.' },
  TOO_MANY_REQUESTS: {
    status: 429,
    code: 'TOO_MANY_REQUESTS',
    message: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
  },
  INTERNAL_SERVER_ERROR: {
    status: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: '서버 내부 오류가 발생했습니다.',
  },
  KAKAO_API_FAILED: {
    status: 502,
    code: 'KAKAO_API_FAILED',
    message: '카카오 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
  },
});

/** 로그인(accessToken)과 회원 상태별 접근 — 명세서 "인증 방식", "회원 상태별 접근" */
export const AuthError = defineErrors({
  TOKEN_REQUIRED: { status: 401, code: 'TOKEN_REQUIRED', message: '로그인이 필요해요.' },
  TOKEN_INVALID: {
    status: 401,
    code: 'TOKEN_INVALID',
    message: '로그인 정보가 올바르지 않아요. 다시 로그인해 주세요.',
  },
  TOKEN_EXPIRED: {
    status: 401,
    code: 'TOKEN_EXPIRED',
    message: '로그인이 만료되었어요. 다시 로그인해 주세요.',
  },
  TERMS_REQUIRED: { status: 403, code: 'TERMS_REQUIRED', message: '약관 동의를 먼저 해 주세요.' },
  PROFILE_REQUIRED: {
    status: 403,
    code: 'PROFILE_REQUIRED',
    message: '프로필 설정을 먼저 끝내 주세요.',
  },
  MEMBER_SUSPENDED: {
    status: 403,
    code: 'MEMBER_SUSPENDED',
    message: '이용이 정지된 계정이에요. 고객센터에 문의해 주세요.',
  },
});
