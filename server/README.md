# server

Node.js 24 + Express 5 + TypeScript + Prisma 7 (MySQL 8)

## 처음 세팅

명령어는 저장소 루트(`foonquer/`)에서 실행한다.

1. 의존성 설치

   ```bash
   pnpm install
   ```

2. 환경변수 파일 만들기: `server/.env.example`을 복사해 `server/.env`로 만들고 `DATABASE_URL`을 내 DB에 맞게 고친다.

3. 로컬 MySQL 8 준비 (둘 중 하나)
   - MySQL이 설치돼 있으면 DB만 만든다.
     ```sql
     CREATE DATABASE foonquer CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
     ```
   - Docker가 있으면
     ```bash
     docker run -d --name foonquer-mysql -p 3307:3306 -e MYSQL_ROOT_PASSWORD=password -e MYSQL_DATABASE=foonquer mysql:8.4 --character-set-server=utf8mb4 --collation-server=utf8mb4_0900_ai_ci
     ```

4. 테이블 만들기와 기본 데이터 넣기

   ```bash
   pnpm -C server db:migrate
   pnpm -C server db:seed
   ```

5. 서버 실행: `pnpm -C server dev` → http://localhost:3000/api/v1/health

## 명령어

| 명령어 (`pnpm -C server ...`)            | 하는 일                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `dev`                                    | 개발 서버 (파일 바꾸면 자동 재시작)                                         |
| `build` / `start`                        | 빌드 / 빌드 결과 실행                                                       |
| `typecheck` · `lint` · `format` · `test` | 타입 검사 · ESLint · Prettier · Vitest                                      |
| `db:migrate`                             | 스키마 변경을 마이그레이션으로 만들고 로컬 DB에 적용 (`prisma migrate dev`) |
| `db:deploy`                              | 마이그레이션만 적용 (운영 배포용, `prisma migrate deploy`)                  |
| `db:seed`                                | 기본 데이터 넣기 (카테고리 12개)                                            |
| `db:studio`                              | DB를 브라우저에서 보기                                                      |

## 폴더 구조

```
src/
  main.ts              서버 시작, 종료 처리
  app.ts               Express 앱 (미들웨어, /api/v1 라우터, 에러 핸들러)
  routes.ts            /api/v1 아래 도메인 라우터 연결
  config/env.ts        환경변수 검증 (zod)
  lib/prisma.ts        Prisma 클라이언트 (MariaDB 어댑터)
  common/
    response.ts        성공 응답 ok(), created()
    errors/            AppError, 공통 에러 코드
    middlewares/       validate(), notFound, errorHandler
  modules/<도메인>/     도메인별 router · service · errors
  generated/prisma/    Prisma가 만드는 코드 (커밋하지 않음)
prisma/
  schema.prisma        DB 스키마 (ERD와 같게 유지)
  migrations/          마이그레이션 SQL (커밋한다)
  check-constraints.sql  ERD의 CHECK 제약
  seed.ts              기본 데이터
test/                  Vitest + supertest
```

## 규칙

- **응답**: 성공은 `ok(res, data, message?)` → `{ success: true, data, message }`, 실패는 `throw new AppError(에러코드)` → `{ success: false, code, message }`. 응답을 직접 `res.json()`으로 만들지 않는다.
- **에러 코드**: 도메인 접두어 + 번호 (`AUTH_001`, `REVIEW_003`). 공통은 `common/errors/error-codes.ts`, 도메인 에러는 `modules/<도메인>/<도메인>.errors.ts`에 같은 모양으로 둔다.
- **요청 검증**: `validate({ body, query, params })`에 zod 스키마를 넘긴다. 실패하면 `COMMON_001`.
- **async 핸들러**: Express 5라서 `async` 핸들러에서 던진 에러도 에러 핸들러로 간다. try/catch로 감쌀 필요 없다.
- **id**: DB의 bigint는 응답 JSON에서 숫자로 나간다. decimal(별점·좌표 등)은 문자열로 나가니 필요하면 `Number()`로 바꿔서 보낸다.
- **스키마 변경**: `schema.prisma`를 고치고 `pnpm -C server db:migrate --name 무엇을_바꿨는지`. 생긴 `prisma/migrations/` 폴더를 같이 커밋한다. 운영에는 `migrate deploy`만 쓴다 (`db push` 금지).
- **CHECK 제약**: Prisma 스키마로 못 쓰니 새로 필요하면 `--create-only`로 마이그레이션을 만들고 그 `migration.sql`에 `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)`를 직접 넣는다. MySQL 8은 외래 키 동작(SET NULL·CASCADE)이 걸린 컬럼을 CHECK에 쓸 수 없으니, 그 관계는 `onDelete: Restrict, onUpdate: Restrict`로 둔다 (예: `Visit.restaurant`).
