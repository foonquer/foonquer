import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`server listening on :${env.PORT} (${env.NODE_ENV})`);
});

// docker compose up --force-recreate 등으로 컨테이너가 내려갈 때 요청을 마무리하고 DB 연결을 닫는다.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
