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
| **Web** | ![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black) ![Vite](https://img.shields.io/badge/Vite_PWA-646CFF?style=for-the-badge&logo=vite&logoColor=white) ![Kakao](https://img.shields.io/badge/Kakao_Map_SDK-FFCD00?style=for-the-badge&logo=kakao&logoColor=black) | 앱 설치 없이 모바일 웹으로 카메라·위치를 쓰기 위해 PWA, 지도는 카카오맵 |
| **외부 API** | ![Kakao](https://img.shields.io/badge/Kakao_Local_API-FFCD00?style=for-the-badge&logo=kakao&logoColor=black) ![Naver](https://img.shields.io/badge/CLOVA_OCR-03C75A?style=for-the-badge&logo=naver&logoColor=white) ![Gemini](https://img.shields.io/badge/Gemini_API-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white) | 가게 검색, 영수증 인식(영수증 특화 모델), AI 리뷰 분석(무료 티어) |
| **Infra** | ![GCP](https://img.shields.io/badge/GCP_Compute_Engine·Cloud_Storage-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white) ![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white) ![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white) ![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white) | 서버는 GCP Compute Engine에 Docker로, 웹은 Vercel로 배포. 이미지는 Cloud Storage |
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
│   │   │   ├── errors/      # AppError, defineErrors(), 공통 에러 코드
│   │   │   ├── auth/        # requireAuth(), accessToken(JWT), 약관 동의 확인
│   │   │   ├── middlewares/ # validate(), rateLimit(), notFound, errorHandler
│   │   │   ├── time.ts      # KST 시각 변환
│   │   │   ├── pagination.ts
│   │   │   ├── geo.ts       # 두 좌표 사이 거리(m)
│   │   │   └── ttl-cache.ts # 정해진 시간 동안만 기억하는 메모리 캐시 (카카오 응답 캐시)
│   │   ├── modules/         # 도메인별 router · service · schema · errors
│   │   │   ├── auth/        # 카카오 로그인, 약관 동의, 토큰
│   │   │   ├── user/        # 프로필, 내 동네
│   │   │   ├── region/      # 동 검색 (data/seoul-regions.json = 서울 구·법정동 원본)
│   │   │   ├── map/         # 지도 영역 음식점
│   │   │   ├── restaurant/  # 가게 미리보기·상세, 카카오 가게 저장 규칙, 카테고리 매핑, 내 정복 상태
│   │   │   ├── search/      # 검색 홈, 맛집 검색, 추천 (data/similar-keywords.json = 비슷한 메뉴표)
│   │   │   └── health/
│   │   ├── types/           # Express Request 타입 확장 (req.auth)
│   │   └── generated/       # Prisma가 만드는 코드 (커밋하지 않음)
│   ├── prisma/
│   │   ├── schema.prisma    # DB 스키마 (ERD와 같게 유지)
│   │   ├── migrations/      # 마이그레이션 SQL (커밋한다)
│   │   ├── check-constraints.sql
│   │   ├── seed-data.ts     # 기본 데이터 목록 (카테고리 12개, 약관, 서울 구·법정동 …)
│   │   └── seed.ts          # 기본 데이터 넣기 (배포·로컬)
│   ├── test/                # Vitest + supertest (실제 MySQL 테스트 DB)
│   │   ├── global-setup.ts  # 테스트 DB 생성·마이그레이션·기본 데이터
│   │   └── helpers/         # resetDb(), createMember(), bearer()
│   └── Dockerfile
├── web/                     # 웹 (Vite + React + PWA)
│   ├── src/
│   │   ├── main.tsx         # 앱 시작
│   │   ├── router.tsx       # 화면 경로 목록 (로그인 단계별 가드, 하단 탭, 준비 중 화면 자리)
│   │   ├── pages/           # 화면 (auth/: 카카오 로그인·약관 동의, profile-setup/: 프로필 설정 …)
│   │   ├── api/             # 도메인별 서버 호출 함수와 응답 타입 (auth.ts, users.ts, regions.ts …)
│   │   ├── components/      # 공통 컴포넌트 (헤더, 버튼, 입력창, 시트, 확인창, 토스트, 하단 탭 …)
│   │   ├── data/            # 화면에서 쓰는 고정 데이터 (서울 구·동 목록)
│   │   ├── lib/             # api.ts(서버 호출), session.ts(로그인 상태), useAsync.ts(데이터 불러오기)
│   │   ├── assets/          # Figma에서 내려받은 아이콘·일러스트 SVG
│   │   ├── styles/          # 전역 CSS, Figma 색 변수(--mk-*)
│   │   └── test/            # Vitest + Testing Library (http.ts: 가짜 서버, render.tsx: 경로로 화면 그리기)
│   ├── public/              # 아이콘, favicon (PWA 아이콘은 임시)
│   ├── vite.config.ts       # PWA 설정, /api 개발 프록시
│   └── vercel.json          # Vercel 배포 설정
├── docs/                    # ERD, API 명세 등 기획 문서
├── scripts/deploy-remote.sh # Compute Engine VM에서 실행되는 배포 스크립트
├── docker-compose.yml       # VM에서 서버 컨테이너 실행
└── package.json             # 루트: husky, lint-staged (pnpm workspace)
```

### 도메인 모듈 만들기

새 기능은 `server/src/modules/<도메인>/` 아래에 만들고 `routes.ts`에 한 줄 연결한다.

```
modules/review/
├── review.router.ts    # 라우트 정의 + validate()
├── review.service.ts   # 비즈니스 로직, Prisma 호출
├── review.schema.ts    # 요청 검증용 zod 스키마
└── review.errors.ts    # REVIEW_NOT_FOUND 같은 도메인 에러 코드 (명세서 이름 그대로)
```

```ts
// routes.ts
router.use('/reviews', reviewRouter);
```

### 웹 화면 만들기

화면은 `web/src/pages/`에 만들고 `router.tsx`에 경로를 붙인다. 아직 없는 화면은 `ComingSoonPage`(준비 중) 자리가 있으니 그 `element`만 바꾸면 된다.

- **스타일**: 화면마다 CSS Module(`XxxPage.module.css`)을 쓰고, 색은 `styles/global.css`의 Figma 변수(`var(--mk-green)` 등)만 쓴다. 글꼴은 Pretendard.
- **서버 호출**: `api.get/post/patch/delete`는 성공하면 `data`를, 실패하면 `ApiError`(`code`, `message`, `data`)를 던진다. 메시지까지 필요하면 `api.call()`. 로그인 토큰은 알아서 붙고, `TOKEN_EXPIRED`면 한 번 재발급한 뒤 다시 보낸다.
- **로그인 상태**: accessToken은 메모리에만 두고 refreshToken은 서버의 httpOnly 쿠키다. 앱을 열면 `POST /auth/refresh`로 로그인을 복구한다. 로그인 API가 성공하면 `signIn(accessToken, nextAction)`만 부르면 라우트 가드가 다음 화면(약관 동의·프로필 설정·홈)으로 보낸다.
- **화면 데이터**: `useAsync(() => api.get(...), [deps])` → `{ data, error, loading, reload }`.
- **보고 있는 동네·내 위치**: 홈·검색·추천은 `useViewRegion()`(처음엔 내 동네 첫 곳, 지역 선택 시트로 바꾼다)과 `useMyCoords()`(위치 권한이 없으면 `null`)를 같이 쓴다.
- **공통 컴포넌트**: `Screen`(화면 틀·하단 버튼), `AppHeader`(‹ 제목), `PageTitle`(큰 제목·설명), `Button`, `TextField`, `ChoiceGroup`(성별·나이대 같은 버튼 고르기), `BottomSheet`, `Dialog`, `useToast()`, `FilterChips`, `DongFinder`(동 검색·현재 위치·구/동 목록), `ConsentCard`(약관 동의), `MenuList`(내 정보·설정 메뉴 줄), `RestaurantCard`(음식점 목록 카드), `RegionSelectSheet`(지역 선택), `EmptyState`, `Loading`.

```tsx
export function MyReviewsPage() {
  const { data, error, reload } = useAsync(() => api.get<ReviewList>('/users/me/reviews'), []);
  return (
    <Screen>
      <AppHeader title="내 리뷰" />
      {error ? <EmptyState title={errorMessage(error)} onRetry={reload} /> : /* data로 목록 */ null}
    </Screen>
  );
}
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

`server/.env.example`을 복사해 `server/.env`를 만들고, 웹은 `web/.env.example`을 복사해 `web/.env.local`을 만든다. 위 Docker 설정 그대로면 서버는 켜진다.

```bash
cp server/.env.example server/.env                 # macOS / Linux
cp web/.env.example web/.env.local
Copy-Item server\.env.example server\.env          # Windows PowerShell
Copy-Item web\.env.example web\.env.local
```

키가 필요한 기능은 아래 값을 채워야 동작한다. 키는 저장소에 올리지 않고 팀 채널로 따로 주고받는다.

| 기능 | 넣을 값 | 비워 두면 |
| --- | --- | --- |
| 지도·맛집 검색에 카카오 가게 불러오기, 카카오 로그인 | `server/.env`의 `KAKAO_REST_API_KEY` | DB에 있는 가게만 보이고(처음엔 없음) 카카오 로그인이 안 된다 |
| 홈 카카오 지도 | `web/.env.local`의 `VITE_KAKAO_MAP_KEY` | 가게 위치만 점으로 보여 주는 간단한 지도 |

로그인은 카카오 하나만 있으므로, 로컬에서 로그인해 보려면 `KAKAO_REST_API_KEY`가 있어야 한다.

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

### 6. 웹 실행

서버를 켜 둔 상태에서 터미널을 하나 더 열고 실행한다.

```bash
pnpm -C web dev
```

http://localhost:5173 을 연다. 개발 중에는 웹의 `/api` 요청을 Vite가 `localhost:3000`으로 넘겨 준다 (CORS 설정 불필요).
서버와 이어졌는지는 브라우저 개발자 도구 Network 탭에서 보면 된다. 앱을 열 때 부르는 `/api/v1/auth/refresh`가 **401**(로그인 전이라 정상)이면 연결된 것이고, 500이면 서버가 꺼져 있는 것이다.

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

### 서버 명령어 (`pnpm -C server ...`)

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
| `job <이름>` / `job:prod <이름>` | 주기 작업 한 번 실행 (개발: tsx / 운영: 빌드 결과). 이름은 아래 표, `all`이면 전부 |

#### 주기 작업 (하루 1번)

| 이름 | 하는 일 |
| --- | --- |
| `rating` | 전체 평균 별점 m 갱신(공개 리뷰 30개부터), 작성자 신뢰 온도·시간 감쇠를 반영해 리뷰 가중치·가게 가중 별점 다시 계산 |
| `season` | 끝난 시즌 확정(순위·티어 확정, 시즌 결과, 먹포인트·방망이·왕관·밤하늘 보상, 업적, 알림), 다음 시즌 열기 |
| `cleanup` | 30일 지난 알림, 만료된 로그인 토큰·카카오 결과 교환 코드 삭제 |
| `saved-reminder` | 저장한 지 12일 지난 가게(알림 켬, 아직 정복 안 함)에 한 번 알림 |

운영 VM에서는 deploy 사용자 crontab에 넣는다. 예) 매일 새벽 4시(KST)
`0 19 * * * cd ~/foonquer/server && pnpm job:prod all >> ~/job.log 2>&1` (VM 시간대가 UTC일 때)

### 웹 명령어 (`pnpm -C web ...`)

| 명령어 | 하는 일 |
| --- | --- |
| `dev` | 개발 서버 (http://localhost:5173) |
| `build` / `preview` | 빌드(타입 검사 포함) / 빌드 결과 미리 보기 |
| `typecheck` · `lint` · `format` · `test` | 타입 검사 · ESLint · Prettier · Vitest |

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
| `JWT_ACCESS_SECRET` | accessToken(JWT) 서명 키. 32자 이상 임의 문자열 | `.env.example` 값 그대로 |
| `TRUST_PROXY` | 서버 앞 프록시(nginx·로드밸런서·Cloudflare) 단계 수. 요청 횟수 제한이 실제 사용자 IP를 보게 한다 | `0` |
| `COOKIE_SECURE` | 쿠키 Secure 속성 (`true`/`false`) | `true` |
| `TEST_DATABASE_URL` | 테스트 DB 주소. 이름이 `_test`로 끝나야 한다 | 비워 두면 `mysql://root:password@localhost:3307/foonquer_test` |
| `FRONTEND_URL` | 웹 주소. 카카오 로그인이 끝나면 `{FRONTEND_URL}/oauth/callback`으로 보낸다 | `http://localhost:5173` |
| `IMAGE_BASE_URL` | 프로필·리뷰 사진 공개 주소(`https://storage.googleapis.com/<버킷>` 또는 Cloud CDN 도메인). 비우면 사진 URL을 `null`로 준다 | 비워 둔다 |
| `GCS_BUCKET` | 사진을 두는 Cloud Storage 버킷. 올린 사진 key가 실제로 있는지 확인한다. 비우면 사진 key를 받지 않는다(`PROFILE_IMAGE_NOT_FOUND`) | 비워 둔다 |
| `GCS_PRIVATE_BUCKET` | 영수증·현장·문의 사진을 두는 비공개 버킷(UPLOAD-01). 조회는 서버가 만든 signed URL로만 한다 | 비워 둔다 |
| `CLOVA_OCR_URL` · `CLOVA_OCR_SECRET` | 네이버 CLOVA OCR 영수증 특화 모델 주소·Secret Key(VISIT-03). 비우면 영수증 인증이 `UNREADABLE`로 실패한다 | 비워 둔다 |
| `API_BASE_URL` | 이 API 서버의 바깥 주소. 카카오 로그인 redirect_uri를 만든다 | `http://localhost:3000` |
| `KAKAO_REST_API_KEY` | 카카오 REST API 키 (카카오 로그인 client_id, 카카오 로컬 API) | 카카오 개발자 콘솔 |
| `KAKAO_CLIENT_SECRET` | 카카오 로그인 Client Secret (콘솔에서 켰을 때만) | 비워 둔다 |

> **카카오 로컬 API**: 지도(MAP-01)·맛집 검색(SEARCH-02)은 카카오 장소 검색으로 우리 DB에 없는 가게를 저장한 뒤 DB 기준으로 응답한다. 같은 영역·같은 검색어는 24시간 동안 서버 메모리에 캐시해 카카오를 다시 부르지 않는다(하루 호출 한도). 카카오가 실패해도 에러 대신 DB 결과만 준다. 카카오는 한 번 검색에 분류(음식점·카페)마다 최대 45곳까지만 주므로, 가게가 아주 많은 동네에서 지도를 넓게 보면 일부 가게는 지도를 확대해 그 영역을 다시 볼 때 저장된다. 카카오 개발자 콘솔에서 이 앱의 **카카오맵 API(지도·로컬)를 활성화**해야 로컬 API가 응답한다.

> **카카오 로그인 Redirect URI**: 카카오 개발자 콘솔에 `{API_BASE_URL}/api/v1/auth/oauth/kakao/callback`을 글자 하나까지 똑같이 등록한다. 동의 항목(이메일·닉네임 등)은 켜지 않는다 — 카카오 회원번호만 쓴다. 로그인이 끝나면 서버가 `{FRONTEND_URL}/oauth/callback?code=…`(실패 시 `?error=…`)로 보내므로 웹에 그 페이지가 있어야 한다. 웹은 받은 code로 `POST /api/v1/auth/oauth/exchange`를 부른다.

운영 서버의 환경변수는 GCP Secret Manager의 `foonquer-prod-env`(`.env` 파일 내용 그대로)에 두고, 배포할 때 VM에서 `.env`로 만든다. Cloud Storage와 Secret Manager는 VM 서비스 계정으로 접근하므로 키 파일을 두지 않는다.

### 웹 (`web/.env.local`)

Vite는 `VITE_`로 시작하는 변수만 화면 코드에 넣는다. **비밀값(API 키 비밀번호 등)은 넣지 않는다** — 빌드 결과에 그대로 보인다.

| 변수 | 설명 | 로컬 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | API 서버 주소 | 비워 둔다 (개발 프록시 사용) |
| `VITE_KAKAO_MAP_KEY` | 카카오 지도 JavaScript 키 (홈 지도). 비우면 가게 위치만 점으로 보여 주는 간단한 지도로 뜬다 | 카카오 개발자 콘솔 > 앱 키 > JavaScript 키 |

배포(Vercel)에서는 프로젝트 환경변수에 서버 도메인과 카카오 지도 키를 넣는다. 카카오 지도는 카카오 개발자 콘솔 > 플랫폼 > Web에 사이트 도메인(로컬 `http://localhost:5173`, 배포 주소)을 등록해야 뜬다. JavaScript 키는 화면에 공개되는 키라 `VITE_`로 넣어도 된다.

<br>

## 📮 공통 응답 · 에러 코드

모든 API는 `/api/v1` 아래에 있다. 응답 형식과 에러 코드 이름은 **API 명세서(노션)의 공통 규칙**을 그대로 따른다.

### 응답 형식

```jsonc
// 성공
{ "success": true, "data": { ... }, "message": "요청이 성공적으로 처리되었습니다." }

// 실패 — data는 보통 null, 화면에 추가 정보가 필요한 에러만 객체
{ "success": false, "code": "TOKEN_EXPIRED", "message": "로그인이 만료되었어요. 다시 로그인해 주세요.", "data": null }
{ "success": false, "code": "LOCAL_REGION_CHANGE_LIMITED", "message": "내 동네는 한 시즌에 한 번만 바꿀 수 있어요. (1월 1일부터 가능)", "data": { "nextChangeAvailableAt": "2027-01-01" } }
```

```ts
import { ok, created } from '../../common/response';
import { AppError } from '../../common/errors/app-error';
import { AuthError, CommonError } from '../../common/errors/error-codes';

ok(res, review, '리뷰를 조회했어요.');      // 200 (메시지는 명세서 Response의 message)
created(res, review, '리뷰를 등록했어요.'); // 201
ok(res, null, '로그아웃했어요.');           // 삭제·로그아웃도 200 + 바디 (204는 쓰지 않음)
throw new AppError(AuthError.TOKEN_EXPIRED);                               // 401 TOKEN_EXPIRED
throw new AppError(ReviewError.REVIEW_NOT_FOUND, '이미 지운 리뷰예요.');    // 메시지만 바꾸기
throw new AppError(UserError.LOCAL_REGION_CHANGE_LIMITED, undefined, { nextChangeAvailableAt });   // data 넣기
```

- 응답은 `res.json()`으로 직접 만들지 않고 항상 `ok()` / `created()` / `AppError`를 쓴다.
- Express 5라서 `async` 핸들러에서 던진 에러도 에러 핸들러로 간다. try/catch로 감쌀 필요가 없다.
- DB의 bigint id는 JSON에서 **숫자**로 나간다. decimal(별점, 좌표, 신뢰 온도)은 **문자열**로 나가니 `Number()`로 바꿔서 보낸다.
- 시각은 DB에 UTC로 저장하고 응답은 KST ISO 8601(`2026-10-06T13:02:11+09:00`)로 준다. `common/time.ts`의 `toKstIso()`, 날짜만은 `toKstDate()` / DB DATE 컬럼은 `formatDbDate()`.
- 목록은 `common/pagination.ts`의 `pageQuery`(page 1부터, size 기본 20·최대 50)와 `toPageResult()`(items, page, size, totalCount, hasNext)를 쓴다.

### 공통 에러 코드 (`common/errors/error-codes.ts`)

| HTTP | code | 언제 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 필수 값 누락, 타입·형식 오류, 깨진 JSON (API별 세부 코드가 있으면 그것을 우선) |
| 401 | `TOKEN_REQUIRED` / `TOKEN_INVALID` / `TOKEN_EXPIRED` | accessToken 없음 / 위조·형식 오류·탈퇴 회원 / 만료 (만료만 재발급 시도) |
| 403 | `FORBIDDEN` | 남의 데이터에 접근 |
| 403 | `TERMS_REQUIRED` / `PROFILE_REQUIRED` | 가입 절차가 남은 회원 (아래 "로그인이 필요한 API") |
| 403 | `MEMBER_SUSPENDED` | 이용 정지 회원 |
| 404 | `NOT_FOUND` | 대상 없음 (API별 코드가 있으면 그것을 우선, 예: `RESTAURANT_NOT_FOUND`) |
| 409 | `CONFLICT` | 중복·상태 충돌 (API별 코드 우선) |
| 429 | `TOO_MANY_REQUESTS` | 요청 횟수 제한 초과 |
| 500 | `INTERNAL_SERVER_ERROR` | 처리하지 못한 에러 |
| 502 | `KAKAO_API_FAILED` | 카카오 API 실패 |

### 도메인 에러 코드

- 코드 이름은 **명세서 Error 항목에 적힌 이름 그대로** 쓴다 (`OAUTH_RESULT_CODE_REQUIRED`, `REGION_NOT_FOUND` …). 번호 코드(`USER_001`)는 쓰지 않는다.
- 각자 `modules/<도메인>/<도메인>.errors.ts`에 `defineErrors()`로 만든다. 같은 코드를 다른 HTTP 상태로 두 번 정의하면 서버가 시작할 때 에러가 난다.

```ts
import { defineErrors } from '../../common/errors/error-codes';

export const ReviewError = defineErrors({
  REVIEW_NOT_FOUND: { status: 404, code: 'REVIEW_NOT_FOUND', message: '리뷰를 찾을 수 없어요.' },
  REVIEW_ALREADY_WRITTEN: { status: 409, code: 'REVIEW_ALREADY_WRITTEN', message: '이미 리뷰를 쓴 방문이에요.' },
});
```

### 요청 검증

`validate({ body, query, params })`에 zod 스키마를 넘긴다. 통과하면 `req.body` 등이 검증·변환된 값으로 바뀐다.

- zod 에러 메시지 자리에 `defineErrors()`로 만든 **코드 이름**을 넣으면 그 코드로 응답한다.
- 그 밖의 오류는 `VALIDATION_ERROR`로 응답하고 `data.field`에 어느 필드인지 넣는다. 명세서에 VALIDATION_ERROR 문구가 따로 있으면 `validate(schemas, { validationMessage })`로 바꾼다.

```ts
const reviewSchema = z.object({
  content: z.string({ error: 'REVIEW_CONTENT_REQUIRED' }).trim().min(1, { error: 'REVIEW_CONTENT_REQUIRED' }),
  taste: z.number().int().min(1).max(5), // 실패하면 VALIDATION_ERROR (data.field = 'taste')
});
router.post('/', validate({ body: reviewSchema }), async (req, res) => { ... });
```

### 로그인이 필요한 API (`common/auth/require-auth.ts`)

`requireAuth(level)`이 `Authorization: Bearer {accessToken}`을 확인하고 `req.auth`에 회원 id·상태를 넣는다. level은 명세서 "회원 상태별 접근" 표를 따른다.

| level | 들어올 수 있는 회원 | 막히면 |
| --- | --- | --- |
| `'terms'` | 약관 동의 전 카카오 신규 회원(status P)부터 | — |
| `'profile'` | 약관 동의를 마친 프로필 설정 전 회원(status P)부터 | `TERMS_REQUIRED` |
| `'active'` (기본값) | 활성 회원(status A)만 | `TERMS_REQUIRED` / `PROFILE_REQUIRED` |

이용 정지(S)는 어느 level이든 `MEMBER_SUSPENDED`, 탈퇴(D) 회원의 토큰은 `TOKEN_INVALID`다.

```ts
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';

router.post('/', requireAuth(), validate({ body: createReviewSchema }), async (req, res) => {
  const { userId } = getAuthUser(req); // bigint
  ...
});
```

### 요청 횟수 제한

같은 IP의 요청 수를 제한할 때는 `rateLimit({ windowMs, limit })`(`common/middlewares/rate-limit.ts`)을 라우트에 붙인다. 넘으면 429 `TOO_MANY_REQUESTS`. 서버 1대의 메모리에 세므로 서버를 여러 대로 늘리면 Redis 같은 저장소로 바꿔야 한다.

지금은 붙어 있는 제한이 없다 (이메일 인증·로그인·비밀번호 재설정에 있던 제한은 카카오 로그인만 남기면서 API와 함께 없앴다).

<br>

## 🧪 테스트

`pnpm -C server test`는 **실제 MySQL의 테스트 전용 DB**(`foonquer_test`)에 붙어서 API를 끝까지 호출해 본다 (Vitest + supertest).

- 로컬 Docker MySQL(3307)이 켜져 있으면 따로 할 것이 없다. 테스트를 시작할 때 `test/global-setup.ts`가 테스트 DB를 만들고, 마이그레이션을 적용하고(`prisma migrate deploy`), 카테고리 같은 기본 데이터를 넣는다.
- 다른 DB를 쓰려면 `TEST_DATABASE_URL`을 지정한다. 실수로 개발 DB를 비우지 않도록 DB 이름이 `_test`로 끝나지 않으면 테스트가 시작하지 않는다.
- 테스트는 매번 `resetDb()`로 테이블을 비운다(카테고리·지역 같은 기본 데이터는 남김). 같은 DB를 쓰므로 테스트 파일은 하나씩 차례로 돈다.
- 외부 API(카카오 등)는 `vi.mock()`으로 바꿔서 실제로 호출하지 않는다. 카카오 로컬 API는 `test/helpers/kakao.ts`의 `stubKakao()`로 흉내 낸다.
- GitHub Actions CI도 MySQL 8.4 컨테이너를 띄워 같은 방식으로 돈다.

```ts
import { resetDb } from '../helpers/db';
import { bearer, createMember } from '../helpers/fixtures';

beforeEach(async () => { await resetDb(); });

it('내 프로필을 조회한다', async () => {
  const member = await createMember();
  const res = await request(app).get('/api/v1/users/me').set('Authorization', bearer(member.id));
  expect(res.body.data.id).toBe(Number(member.id));
});
```

웹 테스트(`pnpm -C web test`)는 `src/test/http.ts`의 `mockApi()`로 서버 응답을 흉내 내고, `renderRoute('/경로')`로 실제 라우트에서 화면을 그린다.

<br>

## ✍️ 코드 스타일

- 변수·함수는 **camelCase** (`handleDelete`), 클래스·타입은 **PascalCase** (`AppError`), 상수 객체는 PascalCase (`ReviewError`).
- 파일 이름은 **kebab-case + 역할** (`review.router.ts`, `app-error.ts`).
- 포맷은 Prettier(작은따옴표, 끝 쉼표, 한 줄 100자)가 정한다. 커밋할 때 husky + lint-staged가 바뀐 `.ts`·`.tsx` 파일에 ESLint와 Prettier를 자동으로 돌린다.
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
| 🔨 | Modify | 기존 기능·코드 수정 |
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
- 타입: `init`, `feat`, `modify`, `fix`, `refactor`
- 예시: `feat/#12/review-create`, `fix/#20/login-token`

### 이슈 제목

- 형식: `[태그] 작업 요약`
- 태그: `Init`, `Feat`, `Modify`, `Fix`, `Refactor`
- 예시: `[Feat] 리뷰 작성 API`, `[Fix] 로그인 토큰 만료 처리`

<br>

## 🚢 배포

> 현재 상태: 배포 파이프라인 파일은 준비되어 있고, GCP(Compute Engine VM·서비스 계정·Secret Manager)를 만든 뒤 `.github/workflows/deploy.yml`을 추가하면 활성화된다. GCP 무료 크레딧으로 운영한다.

### 서버 (Compute Engine)

```
develop push → GitHub Actions → Docker 이미지 빌드 → GHCR → gcloud compute ssh (IAP) → VM에서 scripts/deploy-remote.sh
```

1. `server/` 등 서버 관련 파일이 바뀐 커밋이 develop에 올라오면 GitHub Actions가 돈다 (`web/`·`docs/`만 바뀌면 돌지 않는다).
2. `server/Dockerfile`로 이미지를 빌드해 `ghcr.io/foonquer/foonquer-server`에 `latest`와 커밋 SHA 태그로 올린다.
3. VM의 22번 포트는 IAP 대역(`35.235.240.0/20`)에만 열고, `gcloud compute ssh --tunnel-through-iap`로 `deploy-remote.sh`를 실행한다.
4. VM에서: Secret Manager로 `.env` 생성 → 이미지 pull → `prisma migrate deploy` → seed → 컨테이너 재시작.

GCP에서 준비할 것:

| 항목 | 내용 |
| --- | --- |
| VM | Compute Engine(서울 `asia-northeast3`), 액세스 범위(scope) `cloud-platform`으로 생성(기본 범위로는 Secret Manager를 부를 수 없다), Docker·git 설치, 배포용 사용자 `deploy` 홈에 저장소 clone. SSH 사용자가 암호 없이 `deploy`로 전환할 수 있어야 한다(`gcloud compute ssh` 사용자는 기본으로 된다) |
| VM 서비스 계정 | `roles/secretmanager.secretAccessor`, 사진 버킷의 `roles/storage.objectViewer` (사진 업로드 URL을 서버가 만들게 되면 `roles/storage.objectAdmin`과 서명 권한 `roles/iam.serviceAccountTokenCreator`) |
| Secret Manager | `foonquer-prod-env` — 운영 `.env` 내용 |
| Cloud Storage | 공개 사진 버킷(`GCS_BUCKET`, 프로필 `profile/{회원 id}/`·리뷰 사진)은 `allUsers` 읽기 허용, 영수증·현장·문의 사진은 공개하지 않는 별도 버킷에 둔다(`GCS_PRIVATE_BUCKET`, `receipt/`·`site/`·`inquiry/` 폴더). 브라우저에서 signed URL로 바로 올리므로(USER-02, UPLOAD-01) 두 버킷 모두 버킷 CORS에 웹 주소, `PUT`, 요청 헤더 `Content-Type`·`x-goog-content-length-range`·`x-goog-if-generation-match` 허용 |
| DB | Cloud SQL for MySQL 8 또는 VM 안의 MySQL 8 컨테이너. `DATABASE_URL`만 바꾸면 된다 |

GitHub 저장소 설정(Settings → Secrets and variables → Actions)에 필요한 값:

| 종류 | 이름 | 내용 |
| --- | --- | --- |
| Secret | `GCP_SA_KEY` | 배포용 서비스 계정 키(JSON). VM에 IAP로 SSH할 권한만 준다 (`roles/compute.instanceAdmin.v1`, `roles/iap.tunnelResourceAccessor`, `roles/iam.serviceAccountUser`) |
| Variable | `GCP_PROJECT_ID`, `GCE_INSTANCE`, `GCE_ZONE` | 배포할 프로젝트, VM 이름, 영역(예: `asia-northeast3-a`) |

### 웹 (Vercel)

`web/`을 Vercel 프로젝트로 연결한다 (준비 중).

- Vercel에서 이 저장소를 가져오고 **Root Directory를 `web`** 으로 지정한다. pnpm 모노레포는 Vercel이 알아서 인식한다.
- 환경변수 `VITE_API_BASE_URL`에 서버 도메인을 넣는다.
- `web/vercel.json`이 모든 경로를 `index.html`로 보내서, `/restaurants/1` 같은 주소로 바로 들어와도 화면이 뜬다.

### 배포가 실패했거나 잘못 배포됐을 때

1. GitHub Actions 로그에서 실패한 단계를 먼저 확인한다 (SSH 단계는 VM의 stdout/stderr가 함께 찍힌다).
2. 문제 커밋을 develop에서 되돌린다. 되돌린 커밋이 push되면 이전 코드로 다시 배포된다.
   ```bash
   git revert <문제 커밋>
   git push origin develop
   ```
3. 배포 후 상태 확인: `curl https://<서버 도메인>/api/v1/health`
4. 마이그레이션이 이미 적용된 상태라면 되돌리는 SQL을 새 마이그레이션으로 만든다 (마이그레이션 파일을 지우지 않는다).
