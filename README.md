# 🍽️ 먹장깨기 (foonquer)

> 우리 동네 맛집 정복 앱 — 방문을 인증하고, 리뷰를 남기고, 먹깨비와 함께 동네를 정복하세요.

중앙대학교 소프트웨어학부 캡스톤 디자인 3조

<br>

## 👥 팀원

| <img src="https://github.com/an-junhyung.png" width="120" /> | <img src="https://github.com/identicons/foonquer.png" width="120" /> | <img src="https://github.com/sooowii.png" width="120" /> |
| :---: | :---: | :---: |
| [안준형](https://github.com/an-junhyung) | 이지현 | [정수영](https://github.com/sooowii) |
| 회원가입·로그인, 프로필·내 동네, 지도 탐색, 맛집 검색·추천, 음식점 상세, 설정·계정 | 정복 현황·랭킹, 먹깨비 성장·꾸미기, 먹포인트·상점, 알림·고객지원 | 방문 인증, 별점·리뷰, 나만의 맛집 리스트, 다른 이용자 프로필·신고·차단 |

> 역할 구분 없이 셋 다 서버와 화면을 함께 개발하고, 담당은 API(기능) 단위로 나눈다.

<br>

## 📖 서비스 소개

**먹장깨기**는 직접 다녀온 사람만 리뷰를 남길 수 있는 맛집 정복 앱입니다.

- **방문 인증**: 영수증을 찍거나(CLOVA OCR), 가게에서 위치를 확인하고 음식 사진을 올리면 방문이 인증됩니다. 인증 없이는 리뷰를 쓸 수 없어서, 모든 리뷰가 "진짜 다녀온 사람"의 리뷰입니다.
- **정복과 랭킹**: 인증한 가게는 내 정복 기록이 되고, 구마다 시즌제 랭킹과 티어(초보 탐방러 → 단골 → 미식가 → 정복자 → 먹짱)가 매겨집니다.
- **먹깨비**: 내 캐릭터 먹깨비가 지도 위에서 정복한 가게로 이동하며 성장합니다. 리뷰와 활동으로 모은 먹포인트로 모자·얼굴·소품을 꾸미고, 시즌 보상으로 도깨비 방망이를 받습니다.
- **믿을 수 있는 리뷰**: 리뷰마다 작성자의 신뢰 온도와 로컬(내 동네)/외부 방문 여부가 보이고, AI 분석과 "도움돼요" 평가로 신뢰도가 낮은 리뷰는 별점에 덜 반영됩니다.

베타 서비스 지역은 **서울특별시**입니다.

<br>

## 🛠 기술 스택

| 구분 | 기술 | 선택 이유 |
| --- | --- | --- |
| **Server** | ![Node.js](https://img.shields.io/badge/Node.js_24-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white) ![Express](https://img.shields.io/badge/Express_5-000000?style=for-the-badge&logo=express&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white) | 팀원 모두 Node.js 경험이 있고, Express 5는 async 에러를 기본으로 처리해 구조가 단순하다 |
| **DB · ORM** | ![MySQL](https://img.shields.io/badge/MySQL_8-4479A1?style=for-the-badge&logo=mysql&logoColor=white) ![Prisma](https://img.shields.io/badge/Prisma_7-2D3748?style=for-the-badge&logo=prisma&logoColor=white) | 랭킹·집계 쿼리가 많아 관계형 DB, 타입 안전한 쿼리와 마이그레이션 관리를 위해 Prisma |
| **Web** | ![React](https://img.shields.io/badge/React_PWA-61DAFB?style=for-the-badge&logo=react&logoColor=black) ![Kakao](https://img.shields.io/badge/Kakao_Map_SDK-FFCD00?style=for-the-badge&logo=kakao&logoColor=black) | 앱 설치 없이 모바일 웹으로 카메라·위치를 쓰기 위해 PWA, 지도는 카카오맵 |
| **외부 API** | ![Kakao](https://img.shields.io/badge/Kakao_Local_API-FFCD00?style=for-the-badge&logo=kakao&logoColor=black) ![Naver](https://img.shields.io/badge/CLOVA_OCR-03C75A?style=for-the-badge&logo=naver&logoColor=white) ![Gemini](https://img.shields.io/badge/Gemini_API-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white) | 가게 검색, 영수증 인식(영수증 특화 모델), AI 리뷰 분석(무료 티어) |
| **Infra** | ![AWS](https://img.shields.io/badge/AWS_EC2·S3·CloudFront-232F3E?style=for-the-badge&logo=amazonwebservices&logoColor=white) ![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white) ![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white) ![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white) | 서버는 EC2에 Docker로, 웹은 Vercel로 배포. 이미지는 S3 + CloudFront |
| **Tooling** | ![pnpm](https://img.shields.io/badge/pnpm_10.12.1-F69220?style=for-the-badge&logo=pnpm&logoColor=white) ![ESLint](https://img.shields.io/badge/ESLint-4B32C3?style=for-the-badge&logo=eslint&logoColor=white) ![Prettier](https://img.shields.io/badge/Prettier-F7B93E?style=for-the-badge&logo=prettier&logoColor=black) ![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white) | 모노레포(pnpm workspace), 커밋 전 husky + lint-staged로 자동 검사 |

<br>

## 📁 프로젝트 구조

```
foonquer/
├── server/                  # API 서버 (Express + Prisma)
│   ├── src/
│   │   ├── main.ts          # 서버 시작, 종료 처리
│   │   ├── app.ts           # Express 앱 (미들웨어, /api/v1 라우터, 에러 핸들러)
│   │   ├── routes.ts        # /api/v1 아래 도메인 라우터 연결
│   │   ├── config/env.ts    # 환경변수 검증 (zod)
│   │   ├── lib/prisma.ts    # Prisma 클라이언트 (MariaDB 어댑터)
│   │   ├── common/
│   │   │   ├── response.ts  # 성공 응답 ok(), created()
│   │   │   ├── errors/      # AppError, 공통 에러 코드
│   │   │   └── middlewares/ # validate(), notFound, errorHandler
│   │   ├── modules/         # 도메인별 router · service · errors
│   │   │   └── health/
│   │   └── generated/       # Prisma가 만드는 코드 (커밋하지 않음)
│   ├── prisma/
│   │   ├── schema.prisma    # DB 스키마 (ERD와 같게 유지)
│   │   ├── migrations/      # 마이그레이션 SQL (커밋한다)
│   │   ├── check-constraints.sql
│   │   └── seed.ts          # 기본 데이터 (카테고리 12개)
│   ├── test/                # Vitest + supertest
│   └── Dockerfile
├── web/                     # React PWA (준비 중)
├── docs/                    # ERD, API 명세 등 기획 문서
├── scripts/deploy-remote.sh # EC2에서 실행되는 배포 스크립트
├── docker-compose.yml       # EC2에서 서버 컨테이너 실행
└── package.json             # 루트: husky, lint-staged (pnpm workspace)
```

### 도메인 모듈 만들기

새 기능은 `server/src/modules/<도메인>/` 아래에 만들고 `routes.ts`에 한 줄 연결한다.

```
modules/review/
├── review.router.ts    # 라우트 정의 + validate()
├── review.service.ts   # 비즈니스 로직, Prisma 호출
├── review.schema.ts    # 요청 검증용 zod 스키마
└── review.errors.ts    # REVIEW_001 같은 도메인 에러 코드
```

```ts
// routes.ts
router.use('/reviews', reviewRouter);
```

<br>

## 🚀 시작하기

명령어는 모두 저장소 루트(`foonquer/`)에서 실행한다.

### 1. 저장소 받기와 의존성 설치

```bash
git clone https://github.com/foonquer/foonquer.git
cd foonquer
pnpm -v            # 10.12.1인지 확인 (아니면 npm i -g pnpm@10.12.1)
pnpm install       # husky 설정과 prisma generate까지 자동으로 된다
```

### 2. 로컬 MySQL 띄우기 (Docker)

팀 모두 같은 버전을 쓰려고 Docker로 띄운다. 설치형 MySQL이 3306을 쓰고 있을 수 있어서 **3307** 포트를 쓴다.

```bash
docker run -d --name foonquer-mysql -p 3307:3306 -e MYSQL_ROOT_PASSWORD=password -e MYSQL_DATABASE=foonquer mysql:8.4 --character-set-server=utf8mb4 --collation-server=utf8mb4_0900_ai_ci
```

준비됐는지 확인: `docker logs foonquer-mysql`에 `port: 3306 ... ready for connections`가 보이면 된다. 다음부터는 Docker Desktop에서 `foonquer-mysql`을 켜기만 하면 된다.

### 3. 환경변수

`server/.env.example`을 복사해 `server/.env`를 만든다. 위 Docker 설정 그대로면 고칠 것이 없다.

```bash
cp server/.env.example server/.env                 # macOS / Linux
Copy-Item server\.env.example server\.env          # Windows PowerShell
```

### 4. 테이블 만들기와 기본 데이터

```bash
pnpm -C server db:migrate
pnpm -C server db:seed
```

### 5. 서버 실행

```bash
pnpm -C server dev
```

http://localhost:3000/api/v1/health 에서 `{"success":true,"data":{"status":"ok"},...}`가 보이면 성공.

<br>

## 📦 패키지 매니저

- **Node.js 24.14.0**, **pnpm 10.12.1** 로 고정한다 (루트 `package.json`의 `engines`, `packageManager`).
- pnpm이 "Update available" 알림을 띄워도 **업데이트하지 않는다.** 버전이 다르면 `pnpm-lock.yaml` 형식이 달라져 충돌이 난다.
- 패키지는 어느 프로젝트에 넣는지 꼭 지정한다.

```bash
pnpm -C server add zod              # server 의존성
pnpm -C server add -D @types/xxx    # server 개발 의존성
pnpm add -D -w some-tool            # 루트(모노레포 공통) 개발 의존성
```

### 자주 쓰는 명령어 (`pnpm -C server ...`)

| 명령어 | 하는 일 |
| --- | --- |
| `dev` | 개발 서버 (파일을 바꾸면 자동 재시작) |
| `build` / `start` | 빌드 / 빌드 결과 실행 |
| `typecheck` | 타입 검사 |
| `lint` / `format` | ESLint / Prettier |
| `test` | Vitest |
| `db:migrate` | 스키마 변경을 마이그레이션으로 만들고 로컬 DB에 적용 |
| `db:deploy` | 마이그레이션 적용만 (운영 배포용) |
| `db:seed` | 기본 데이터 넣기 |
| `db:studio` | DB를 브라우저에서 보기 |

<br>

## 🗃️ Prisma / DB

- **ORM**: Prisma 7 + `@prisma/adapter-mariadb` 드라이버 어댑터. 접속 주소는 `DATABASE_URL` 하나만 쓴다 (`server/prisma.config.ts`, `server/src/lib/prisma.ts`).
- **스키마**: `server/prisma/schema.prisma`. ERD(docs)의 테이블 42개를 그대로 옮겼고, ERD의 값 설명(코드값 목록 등)은 필드 위 `///` 주석에 있다. **ERD를 바꾸면 스키마도 같이 바꾼다.**
- **이름 규칙**: DB는 snake_case(`reg_date`), 코드는 camelCase(`regDate`). `@map`, `@@map`으로 연결되어 있다.
- **생성 코드**: `server/src/generated/prisma`에 생기고 커밋하지 않는다. `pnpm install` 때 자동으로 만들어지고, 스키마를 바꾼 뒤 `db:migrate`를 해도 다시 만들어진다.

### 스키마를 바꿀 때

```bash
# 1. schema.prisma 수정
# 2. 마이그레이션 생성 + 로컬 DB 적용 (이름은 무엇을 바꿨는지)
pnpm -C server db:migrate --name add_review_tag
# 3. 생긴 server/prisma/migrations/<날짜>_<이름>/ 폴더를 코드와 함께 커밋
```

- 운영 DB에는 `migrate deploy`만 쓴다. **`prisma db push`는 쓰지 않는다** (마이그레이션 기록이 꼬인다).
- 이미 커밋·push한 마이그레이션 파일은 고치지 않는다. 바꿀 게 있으면 새 마이그레이션을 만든다.
- 다른 사람이 올린 마이그레이션을 받았으면 `pnpm -C server db:migrate`로 내 로컬 DB에 적용한다.

### CHECK 제약

Prisma 스키마로는 CHECK 제약을 쓸 수 없어서 마이그레이션 SQL에 직접 넣는다.

```bash
pnpm -C server db:migrate --create-only --name add_xxx_check   # 적용하지 않고 SQL만 만든다
# migration.sql 맨 아래에 ALTER TABLE ... ADD CONSTRAINT ... CHECK (...); 추가
pnpm -C server db:migrate                                       # 적용
```

> ⚠️ MySQL 8은 외래 키 동작(`SET NULL`, `CASCADE`)이 걸린 컬럼을 CHECK에 쓸 수 없다. CHECK에 외래 키 컬럼이 들어가면 그 관계를 `onDelete: Restrict, onUpdate: Restrict`로 둔다 (예: `Visit.restaurant`).

<br>

## 🔐 환경변수

`server/.env` (커밋하지 않음). 새 변수를 추가하면 `server/.env.example`과 `server/src/config/env.ts`(zod 검증)에도 같이 추가한다. 값이 잘못되면 서버가 시작하지 않고 어떤 변수가 문제인지 알려 준다.

| 변수 | 설명 | 로컬 예시 |
| --- | --- | --- |
| `NODE_ENV` | `development` / `test` / `production` | `development` |
| `PORT` | 서버 포트 | `3000` |
| `DATABASE_URL` | MySQL 접속 주소 | `mysql://root:password@localhost:3307/foonquer` |
| `CORS_ORIGINS` | 허용할 웹 주소 (쉼표로 여러 개, 비우면 전체 허용) | `http://localhost:5173` |

운영 서버의 환경변수는 AWS SSM Parameter Store(`/foonquer/prod/*`)에 두고, 배포할 때 EC2에서 `.env`로 만든다.

<br>

## 📮 공통 응답 · 에러 코드

모든 API는 `/api/v1` 아래에 있다.

### 응답 형식

```jsonc
// 성공
{ "success": true, "data": { ... }, "message": "요청에 성공했습니다." }

// 실패
{ "success": false, "code": "AUTH_001", "message": "로그인이 필요합니다." }
```

```ts
import { ok, created } from '../../common/response';
import { AppError } from '../../common/errors/app-error';
import { AuthError, CommonError } from '../../common/errors/error-codes';

ok(res, review);                       // 200
created(res, review, '리뷰를 등록했어요.'); // 201
throw new AppError(AuthError.UNAUTHORIZED);              // 401 AUTH_001
throw new AppError(CommonError.BAD_REQUEST, '닉네임은 2~10자입니다.'); // 메시지만 바꾸기
```

- 응답은 `res.json()`으로 직접 만들지 않고 항상 `ok()` / `created()` / `AppError`를 쓴다.
- Express 5라서 `async` 핸들러에서 던진 에러도 에러 핸들러로 간다. try/catch로 감쌀 필요가 없다.
- DB의 bigint id는 JSON에서 **숫자**로 나간다. decimal(별점, 좌표, 신뢰 온도)은 **문자열**로 나가니 필요하면 `Number()`로 바꿔서 보낸다.

### 공통 에러 코드

| HTTP | code | 기본 메시지 | 언제 |
| --- | --- | --- | --- |
| 400 | `COMMON_001` | 잘못된 요청입니다. | 요청 검증 실패, 깨진 JSON |
| 401 | `AUTH_001` | 로그인이 필요합니다. | 토큰 없음·만료 |
| 403 | `AUTH_002` | 권한이 없습니다. | 남의 리소스 접근 |
| 404 | `COMMON_002` | 요청한 경로를 찾을 수 없습니다. | 없는 API 경로 |
| 500 | `COMMON_500` | 서버 오류가 발생했습니다. | 처리하지 못한 에러 |

### 도메인 에러 코드

- 형식: `도메인_번호` — `USER_001`, `RESTAURANT_002`, `VISIT_003`, `REVIEW_001`, `RANK_001` …
- 각자 `modules/<도메인>/<도메인>.errors.ts`에 공통 에러 코드와 같은 모양으로 만든다.

```ts
export const ReviewError = {
  NOT_FOUND: { status: 404, code: 'REVIEW_001', message: '리뷰를 찾을 수 없습니다.' },
  ALREADY_WRITTEN: { status: 409, code: 'REVIEW_002', message: '이미 리뷰를 작성한 방문입니다.' },
} as const satisfies Record<string, ErrorCodeDef>;
```

### 요청 검증

`validate({ body, query, params })`에 zod 스키마를 넘긴다. 실패하면 `COMMON_001`과 첫 번째 오류 메시지로 응답하고, 통과하면 `req.body` 등이 검증·변환된 값으로 바뀐다.

```ts
const createReviewSchema = z.object({ taste: z.number().int().min(1).max(5), content: z.string().max(500).optional() });
router.post('/', validate({ body: createReviewSchema }), async (req, res) => { ... });
```

<br>

## ✍️ 코드 스타일

- 변수·함수는 **camelCase** (`handleDelete`), 클래스·타입은 **PascalCase** (`AppError`), 상수 객체는 PascalCase (`ReviewError`).
- 파일 이름은 **kebab-case + 역할** (`review.router.ts`, `app-error.ts`).
- 포맷은 Prettier(작은따옴표, 끝 쉼표, 한 줄 100자)가 정한다. 커밋할 때 husky + lint-staged가 바뀐 `.ts` 파일에 ESLint와 Prettier를 자동으로 돌린다.
- 줄바꿈은 LF로 고정(`.gitattributes`). Windows에서도 따로 설정할 것이 없다.

<br>

## 🌿 Git Convention

### Git Flow

```
main ← develop ← feat/#이슈번호/작업명
```

- **main**: 발표·제출용 안정 버전
- **develop**: 개발 통합 브랜치. **develop에 push되면 서버가 배포된다** (배포 활성화 이후)
- **feat / fix / refactor**: 이슈 하나당 브랜치 하나. develop에서 따서 PR로 develop에 합친다
- **develop에 직접 push하지 않는다.** GitHub Free 플랜이라 브랜치 보호를 강제할 수 없어서 팀 약속으로 지킨다

### 작업 흐름

1. 이슈 만들기: `[Feat] 리뷰 작성 API`
2. develop 최신화 후 브랜치 만들기
   ```bash
   git switch develop && git pull
   git switch -c feat/#12/review-create
   ```
3. 작업 → 커밋 → push → **develop으로 PR** (본문에 `close #12`를 쓰면 merge될 때 이슈가 닫힌다)
4. merge한 뒤 작업 브랜치는 삭제한다

### Gitmoji 설치 (한 번만)

```bash
npm i -g gitmoji-cli
```

커밋은 `gitmoji -c`로 이모지를 고르거나, 아래 표대로 직접 쓴다.

### 커밋 메시지

- 형식: `이모지 타입: 설명 (#이슈번호)`
- 예시: `✨ Feat: 리뷰 작성 API (#12)`

| 이모지 | 타입 | 의미 |
| :---: | --- | --- |
| 🎉 | Init | 프로젝트 초기 세팅 |
| ✨ | Feat | 새 기능 |
| 🐛 | Fix | 버그 수정 |
| 💄 | Design | UI·CSS 변경 |
| ✏️ | Typing Error | 오타 수정 |
| 🚚 | Mod | 폴더·파일 이름 변경, 이동 |
| 💡 | Add | 이미지 등 파일 추가 |
| 🔥 | Del | 파일 삭제 |
| ♻️ | Refactor | 리팩터링 |
| 🗃️ | DB | 스키마·마이그레이션 변경 |
| 🔧 | Chore | 설정·패키지 변경 |
| 📝 | Docs | 문서 수정 |

### 브랜치 이름

- 형식: `타입/#이슈번호/작업명` (작업명은 camelCase 또는 kebab-case)
- 타입: `init`, `feat`, `fix`, `refactor`
- 예시: `feat/#12/review-create`, `fix/#20/login-token`

### 이슈 제목

- 형식: `[태그] 작업 요약`
- 태그: `Init`, `Feat`, `Fix`, `Refactor`
- 예시: `[Feat] 리뷰 작성 API`, `[Fix] 로그인 토큰 만료 처리`

<br>

## 🚢 배포

> 현재 상태: 배포 파이프라인 파일은 준비되어 있고, AWS(EC2·IAM·SSM)를 만든 뒤 `.github/workflows/deploy.yml`을 추가하면 활성화된다.

### 서버 (EC2)

```
develop push → GitHub Actions → Docker 이미지 빌드 → GHCR → AWS SSM Run Command → EC2에서 scripts/deploy-remote.sh
```

1. `server/` 등 서버 관련 파일이 바뀐 커밋이 develop에 올라오면 GitHub Actions가 돈다 (`web/`·`docs/`만 바뀌면 돌지 않는다).
2. `server/Dockerfile`로 이미지를 빌드해 `ghcr.io/foonquer/foonquer-server`에 `latest`와 커밋 SHA 태그로 올린다.
3. EC2는 22번 포트를 열지 않고 SSM Run Command로 `deploy-remote.sh`를 실행한다.
4. EC2에서: SSM Parameter Store로 `.env` 생성 → 이미지 pull → `prisma migrate deploy` → seed → 컨테이너 재시작.

GitHub 저장소 설정(Settings → Secrets and variables → Actions)에 필요한 값:

| 종류 | 이름 | 내용 |
| --- | --- | --- |
| Secret | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | SSM 실행 권한만 가진 IAM 사용자 키 |
| Variable | `EC2_INSTANCE_ID` | 배포할 EC2 인스턴스 ID |

### 웹 (Vercel)

`web/`을 Vercel 프로젝트로 연결한다 (준비 중).

### 배포가 실패했거나 잘못 배포됐을 때

1. GitHub Actions 로그에서 실패한 단계를 먼저 확인한다 (SSM 단계는 EC2의 stdout/stderr가 함께 찍힌다).
2. 문제 커밋을 develop에서 되돌린다. 되돌린 커밋이 push되면 이전 코드로 다시 배포된다.
   ```bash
   git revert <문제 커밋>
   git push origin develop
   ```
3. 배포 후 상태 확인: `curl https://<서버 도메인>/api/v1/health`
4. 마이그레이션이 이미 적용된 상태라면 되돌리는 SQL을 새 마이그레이션으로 만든다 (마이그레이션 파일을 지우지 않는다).
