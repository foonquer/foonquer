/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '먹장깨기',
        short_name: '먹장깨기',
        description: '우리 동네 맛집 정복 앱',
        lang: 'ko',
        start_url: '/',
        display: 'standalone',
        // 아이콘·색은 임시값. 디자인이 정해지면 public/의 아이콘과 함께 바꾼다.
        theme_color: '#FF7F6B',
        background_color: '#FFFFFF',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // API 요청은 서비스 워커가 index.html로 바꿔치지 않게 한다.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    port: 5173,
    // 개발 중에는 /api 요청을 로컬 서버로 넘긴다 (CORS 설정 없이 같은 주소처럼 쓰기 위해).
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
