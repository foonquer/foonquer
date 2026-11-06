// 환경변수. 값은 web/.env.local (배포는 Vercel 환경변수)에 넣는다.

/** API 서버 주소. 비우면 같은 주소(개발 중에는 vite 프록시)로 보낸다 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';

export const API_PREFIX = `${API_BASE_URL}/api/v1`;

/**
 * 카카오 지도 JavaScript 키 (카카오 개발자 콘솔 > 앱 > 앱 키 > JavaScript 키).
 * 플랫폼 > Web에 사이트 도메인(로컬은 http://localhost:5173)을 등록해야 지도가 뜬다.
 * 비어 있으면 홈 지도는 가게 위치만 점으로 보여 주는 간단한 지도로 대신한다.
 */
export const KAKAO_MAP_KEY: string = import.meta.env.VITE_KAKAO_MAP_KEY ?? '';
