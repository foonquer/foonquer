// 환경변수. 값은 web/.env.local (배포는 Vercel 환경변수)에 넣는다.

/** API 서버 주소. 비우면 같은 주소(개발 중에는 vite 프록시)로 보낸다 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';

export const API_PREFIX = `${API_BASE_URL}/api/v1`;
