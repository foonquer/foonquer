import { afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma';

// 테스트 파일마다 끝나면 DB 연결을 닫는다.
afterAll(async () => {
  await prisma.$disconnect();
});
