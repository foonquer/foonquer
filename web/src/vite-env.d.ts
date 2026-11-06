/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 서버 주소 (비우면 같은 주소) */
  readonly VITE_API_BASE_URL?: string;
  /** 카카오 지도 JavaScript 키 */
  readonly VITE_KAKAO_MAP_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
