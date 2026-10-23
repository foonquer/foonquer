# server

먹장깨기 API 서버 (Express 5 + TypeScript + Prisma 7 + MySQL 8)

세팅 방법, 명령어, 응답·에러 코드, DB 작업 규칙은 [루트 README](../README.md)에 있다.

```bash
pnpm -C server dev        # 개발 서버 → http://localhost:3000/api/v1/health
pnpm -C server test       # 테스트
pnpm -C server db:migrate # 스키마 변경 적용
```
