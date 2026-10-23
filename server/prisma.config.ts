import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // prisma generate(설치·Docker 빌드)는 DB 없이 돌아야 해서 env()가 아니라 process.env를 쓴다.
    url: process.env.DATABASE_URL ?? '',
  },
});
