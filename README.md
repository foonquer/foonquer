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
| **외부 API** | ![공공데이터](https://img.shields.io/badge/공공데이터_상가(상권)정보-0B4EA2?style=for-the-badge) ![Kakao](https://img.shields.io/badge/Kakao_Local_API-FFCD00?style=for-the-badge&logo=kakao&logoColor=black) ![Naver](https://img.shields.io/badge/CLOVA_OCR-03C75A?style=for-the-badge&logo=naver&logoColor=white) ![Gemini](https://img.shields.io/badge/Gemini_API-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white) | 가게 기본 정보(소상공인시장진흥공단, 저장 가능), 상세 화면 전화번호·카카오맵 링크(카카오는 실시간 표시만), 영수증 인식(영수증 특화 모델), AI 리뷰 분석(무료 티어) |
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
│   │   │   └── geo.ts       # 두 좌표 사이 거리(m)
│   │   ├── modules/         # 도메인별 router · service · schema · errors
│   │   │   ├── auth/        # 카카오 로그인, 약관 동의, 토큰
│   │   │   ├── user/        # 프로필, 내 동네
│   │   │   ├── region/      # 동 검색 (data/seoul-regions.json = 서울 구·법정동 원본)
│   │   │   ├── map/         # 지도 영역 음식점
│   │   │   ├── restaurant/  # 가게 미리보기·상세, 공공데이터 가게 가져오기(store-import), 상세의 카카오 장소 찾기, 카테고리 매핑, 내 정복 상태
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
├── scripts/
│   ├── deploy-remote.sh     # Compute Engine VM에서 실행되는 배포 스크립트
│   └── backup-db.sh         # 운영 DB를 덤프해 Cloud Storage에 백업
├── deploy/Caddyfile         # 운영 https 앞단 (api.foonquer.me → app)
├── docker-compose.yml       # VM에서 app·MySQL·Caddy 컨테이너 실행
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
| 가게 가져오기 (지도·검색에 보이는 가게) | `server/.env`의 `DATA_GO_KR_SERVICE_KEY`, 그다음 `pnpm -C server job store-import` | 가게가 하나도 없다 |
| 카카오 로그인, 음식점 상세의 전화번호·카카오맵 링크 | `server/.env`의 `KAKAO_REST_API_KEY` | 카카오 로그인이 안 되고 상세에 전화번호·링크가 없다 |
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
| `demo <seed\|reviews\|clear> <내 닉네임>` | 랭킹·리뷰 확인용 가짜 데이터 넣기·지우기 (아래 "랭킹 확인용 가짜 데이터") |

#### 주기 작업 (하루 1번)

| 이름 | 하는 일 |
| --- | --- |
| `rating` | 지난주 새 리뷰를 쓴 사람의 합의 일치도 감점(리뷰 10개부터, 주 1번)과 리뷰어 일관성 가중치를 정한 뒤, 작성자 신뢰 온도·공감·일관성·동네 평균·변화 감지 시간 감쇠를 반영해 리뷰 가중치·가게 가중 별점 다시 계산 |
| `season` | 끝난 시즌 확정(순위·티어 확정, 시즌 결과, 먹포인트·방망이 보상, 업적과 업적 보상 아이템(왕관·밤하늘 먹깨비), 알림), 다음 시즌 열기 |
| `cleanup` | 30일 지난 알림, 만료된 로그인 토큰·카카오 결과 교환 코드 삭제, 탈퇴할 때 사진 삭제가 실패한 회원(`member.files_purged_at` 없음)의 영수증·현장·문의·프로필 사진 폴더를 다 지울 때까지 다시 지우기, 올린 지 하루가 지나도 어디에도 저장되지 않은 사진(profile·review·receipt·site·inquiry 폴더) 지우기 |
| `saved-reminder` | 저장한 지 12일 지난 가게(알림 켬, 아직 정복 안 함)에 한 번 알림 |
| `store-import` | 공공데이터 상가(상권)정보 API에서 서울 25개 구의 음식 업종 상가를 가져와 `restaurant`에 반영. 상가업소번호(`bizes_id`)가 같으면 바뀐 것만 갱신, 새 가게는 추가, 목록에서 빠진 가게는 폐업(`C`), 다시 나오면 영업(`A`, 운영자가 숨긴 `H`는 그대로). 구내식당·출장 뷔페·유흥 주점은 가져오지 않는다. 카카오에서 저장했던 옛 가게(`bizes_id` 없음)는 이름이 맞고 100m 안이면 그 행을 이어 쓰고(방문·리뷰 유지), 이어지지 않은 것은 방문·리뷰 등 기록이 없으면 지운다(기록이 있어 남긴 수는 결과의 `legacyKept`). 구 하나를 끝까지 받지 못하면 그 구는 건너뛰고 실패로 센다. `DATA_GO_KR_SERVICE_KEY`가 없으면 건너뛴다 |
| `review-ai` | 아직 분석하지 않은 공개 리뷰 글을 Gemini로 분석(한 번에 50개, 4초 간격). 협찬·리뷰 이벤트 문구를 찾으면 `review.ad_suspected` → 운영자 마패 확인 목록(ADMIN-03 `adSuspected=true`). 결과는 `review.ai_result`(근거 문장, AI 같은 말투, 글 길이, 사진 수). 별점 계산에는 넣지 않는다. 호출 한도(429)에 걸리면 멈추고 다음 실행에서 이어서 한다. 일시적 실패(5xx·시간 초과)는 다음 실행에서 다시 하고, 200인데 답을 읽을 수 없는 글(안전 필터 등)은 `ai_result`에 `unreadable`을 남기고 다시 보내지 않는다. 키·모델 설정이 틀린 응답(401·403·404, 400 `API_KEY_INVALID`)이면 바로 멈추고 실패(종료 코드 1)로 끝난다. `GEMINI_API_KEY`가 없으면 건너뛴다 |

운영 VM에는 Node.js·pnpm을 설치하지 않으므로(서버는 Docker 컨테이너), 돌고 있는 `app` 컨테이너 안에서 빌드 결과를 실행한다. deploy 사용자 crontab에 넣는다. 예) 매일 새벽 4시(KST), VM 시간대가 UTC일 때
`0 19 * * * cd ~/foonquer && /usr/bin/docker compose exec -T app node dist/src/jobs/run.js all >> ~/job.log 2>&1`
(`docker`는 cron 기본 PATH인 `/usr/bin`에 있다. 작업 하나라도 실패하면 나머지는 계속 돌고 종료 코드가 1이 되니 `~/job.log`를 확인한다.)
리뷰 분석을 하루보다 자주 돌리려면 `review-ai`만 한 줄 더 넣는다. 분(minute)은 `all`(19:00 UTC)과 겹치지 않게 어긋나게 둔다 (같은 시각에 두 프로세스가 돌면 같은 리뷰를 두 번 보내 호출 한도에 걸린다). 예) 매시 30분
`30 * * * * cd ~/foonquer && /usr/bin/docker compose exec -T app node dist/src/jobs/run.js review-ai >> ~/job.log 2>&1`

#### 랭킹 확인용 가짜 데이터

역대 랭킹·시즌 기록·구 랭킹 화면을 확인하려고 손으로만 돌리는 작업이다(`all`에는 없다). 닉네임은 가짜 정복 기록을 같이 받을 내 계정.

- `seed`: 가짜 탐험가 24명(`kakao_id`가 `demo-`로 시작, 먹깨비·PICK 2곳)과 내 동네 구 + 다른 구 3곳의 지난 시즌 2개·이번 시즌 정복 기록을 넣는다. 지난 시즌은 시즌 확정 코드로 순위·시즌 결과·보상·알림까지 만들고(확정 시각 = 끝난 다음 날 00:05), 이번 시즌은 구 순위만 다시 계산한다. 내 계정도 시즌마다 정복 기록을 받는다(그 전 시즌 먹짱, 지난 시즌 미식가, 이번 시즌 3위쯤). 내 계정이 방문 인증한 적 있는 가게(별점 대기 포함)에는 가짜 정복을 만들지 않는다. 이미 넣었거나, 지난 시즌에 진짜 기록(방문 포함)이 있거나, 내 계정이 시즌·업적 보상 아이템을 이미 가졌으면 아무것도 넣지 않고 멈춘다
- `reviews` (`seed` 다음에): 가짜 탐험가의 별점 남긴 방문마다 리뷰를 붙인다. 가게마다 맛 수준(3.2~4.8)을 정해 두고 그 근처 맛 별점, 60%는 세부 별점·좋았던(아쉬웠던) 점, 70%는 글. 내 동네(동)마다 가게 12곳에 가짜 탐험가 5~9명의 이번 시즌 방문(셋 중 하나는 재방문, 70%는 현지인)도 넣어 추천 맛집(현지인 인기·재방문·평점)이 차게 하고, 그 구 순위·리뷰 가중치·가게 별점을 다시 계산한다. 가짜 글은 Gemini 리뷰 분석(`review-ai`)에 보내지 않는다. 중간에 끊겨도 다시 돌리면 이어서 한다(가짜 방문을 넣은 동네 가게는 건너뛰고, 리뷰 없는 방문에만 쓰고, 가중치·별점은 모두 다시 센다). 몇 분 걸리고 단계마다 진행 상황을 찍는다. 내 계정에는 리뷰를 만들지 않는다
- `clear`: 가짜 탐험가와 그 기록(리뷰·좋았던 점·도움돼요 포함) 전부, 내 계정의 가짜 정복(영수증 key `demo/receipt.jpg`)과 지난 시즌 결과·보상(먹포인트·아이템·업적·알림, 위 확정 시각으로 찾음)을 지우고 순위와 가짜 방문이 있던 가게의 별점·방문 수를 다시 계산한다. 가짜 정복이 있는 가게를 그사이 진짜로 인증하고 별점까지 남겼으면 그 정복은 진짜 방문으로 옮겨 남긴다. 받은 먹포인트는 지금 잔액에서 그만큼 빼고, 결과가 0보다 작으면 0으로 둔다. 그사이 포인트를 썼으면 원래 있던 포인트도 그만큼 줄어든다(예: 잔액 100 + 보상 100, 50 사용 → clear 뒤 50)

운영: `cd ~/foonquer && docker compose exec -T app node dist/src/jobs/demo-run.js seed <내 닉네임>` → `reviews <내 닉네임>` (지울 때는 `clear`)

#### 운영자 계정 (관리자 API)

`/api/v1/admin/...`(신고 처리, 리뷰 블라인드, 마패, 문의 답변, 공지·FAQ, 약관, 회원 이용 정지)은 `member.role = 'A'`인 회원만 쓸 수 있다. 신고 처리와 1:1 문의 답변은 웹 `/admin`(내 정보 > 운영 관리, 운영자에게만 보임)에서 하고, 나머지는 API로 부른다. 운영자는 DB에서 직접 지정한다.
`UPDATE member SET role = 'A' WHERE id = ?;` (되돌리기: `role = 'U'`)

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
| `GEMINI_API_KEY` | Gemini API 키 (주기 작업 `review-ai`의 리뷰 글 분석). 비우면 분석하지 않는다 | 비워 둔다 |
| `GEMINI_MODEL` | 리뷰 분석 모델 | `gemini-3.5-flash-lite` |
| `API_BASE_URL` | 이 API 서버의 바깥 주소. 카카오 로그인 redirect_uri를 만든다 | `http://localhost:3000` |
| `DATA_GO_KR_SERVICE_KEY` | 공공데이터포털 일반 인증키 (상가(상권)정보 API, 주기 작업 `store-import`). Decoding 키를 넣는다(Encoding 키를 넣어도 서버가 풀어서 쓴다) | 공공데이터포털 > 마이페이지 |
| `KAKAO_REST_API_KEY` | 카카오 REST API 키 (카카오 로그인 client_id, 카카오 로컬 API) | 카카오 개발자 콘솔 |
| `KAKAO_CLIENT_SECRET` | 카카오 로그인 Client Secret (콘솔에서 켰을 때만) | 비워 둔다 |
| `KAKAO_LOCAL_API_KEY` | 카카오 로컬 API만 다른 앱의 REST 키로 부를 때 (카카오맵 무료 쿼터는 계정에서 처음 카카오맵을 켠 앱에만 있다). 비우면 `KAKAO_REST_API_KEY` | 비워 둔다 |

> **가게 정보와 카카오 로컬 API**: 카카오 로컬 API 결과는 실시간으로 보여 주는 데만 쓸 수 있고, 장소 ID·장소 URL 말고는 저장하면 안 된다(카카오 데브톡 공식 답변). 그래서 가게 기본 정보(상호·업종·주소·좌표)는 이용허락범위 제한이 없는 공공데이터 [소상공인시장진흥공단 상가(상권)정보](https://www.data.go.kr/data/15012005/openapi.do)를 주기 작업 `store-import`로 DB에 넣고, 지도(MAP-01)·맛집 검색(SEARCH-02)은 DB만 본다(검색은 가게 이름·업종 소분류·영수증 메뉴). 카카오는 음식점 상세(REST-01)와 홈 지도 누르기(MAP-03)에서만 부른다. REST-01은 가게 이름으로 그 좌표 100m 안을 찾아 이름이 맞는 곳의 전화번호는 응답에만 쓰고, 장소 ID만 `restaurant.kakao_place_id`에 저장한다(카카오맵 링크용). 카카오가 실패해도 에러 대신 전화번호 없이 준다. MAP-03은 누른 좌표 근처 카카오 음식점·카페(카테고리 FD6·CE7)를 가까운 순으로 5곳 찾아 각각 장소 ID나 100m 안 이름이 맞는 우리 가게와 잇고(이때도 장소 ID만 저장), 웹은 그 목록에서 고르게 한다. 카카오 지도에 그려진 가게 이름이 카카오 좌표에 있어서 공공데이터 좌표보다 누른 가게와 잘 맞는다. 카카오가 실패하면 DB에서 가까운 가게로 대신한다. REGION-02(현재 위치로 동 찾기)의 좌표 → 법정동 변환도 실시간 호출이다. 카카오 개발자 콘솔에서 이 앱의 **카카오맵 API(지도·로컬)를 활성화**해야 로컬 API가 응답한다.

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

| 부분 | 주소 | 어디 |
| --- | --- | --- |
| 웹 | `https://foonquer.me` | Vercel (`web/`) |
| 서버 | `https://api.foonquer.me` | GCP 프로젝트 `foonquer-prod`, Compute Engine VM(서울 `asia-northeast3`) 하나에 Docker로 app·MySQL·Caddy |
| 사진 | Cloud Storage 공개 버킷(프로필·리뷰), 비공개 버킷(영수증·현장·문의) | 같은 프로젝트 |

웹과 서버가 같은 사이트(`foonquer.me`)라 로그인 유지 쿠키(SameSite=Lax)가 그대로 간다.

### 서버 (Compute Engine)

```
develop push → GitHub Actions(deploy.yml) → Docker 이미지 빌드 → GHCR → gcloud compute ssh (IAP) → VM에서 scripts/deploy-remote.sh
```

1. `server/`·`docker-compose.yml`·`deploy/` 등 서버 관련 파일이 바뀐 커밋이 develop에 올라오면 GitHub Actions가 돈다 (`web/`·`docs/`만 바뀌면 돌지 않는다). Actions 화면에서 직접 돌릴 수도 있다(workflow_dispatch).
2. `server/Dockerfile`로 이미지를 빌드해 `ghcr.io/foonquer/foonquer-server`에 `latest`와 커밋 SHA 태그로 올린다.
3. VM의 22번 포트는 IAP 대역(`35.235.240.0/20`)에만 열고, `gcloud compute ssh --tunnel-through-iap`로 `deploy-remote.sh`를 실행한다.
4. VM에서: 워크플로가 보낸 파일(`docker-compose.yml`·`deploy/`·`scripts/backup-db.sh`)을 `~/foonquer`에 풀기 → Secret Manager로 `.env` 생성 → 이미지 pull → DB 컨테이너를 띄우고 기다림 → `prisma migrate deploy` → seed → 컨테이너 재시작. VM은 저장소를 clone하지 않고, 워크플로가 보낸 이번 커밋의 파일만 쓴다.
5. 끝나면 `https://{API_DOMAIN}/api/v1/health`로 확인한다.

VM 안 컨테이너 (`docker-compose.yml`):

| 컨테이너 | 하는 일 |
| --- | --- |
| `app` | API 서버. 바깥에 포트를 열지 않고 `caddy`가 넘겨 준다 |
| `db` | MySQL 8.4. 데이터는 `mysql_data` 볼륨. 바깥에 열지 않는다 |
| `caddy` | 80·443을 받아 `API_DOMAIN` 인증서를 Let's Encrypt로 자동 발급·갱신하고 `app`으로 넘긴다 (`deploy/Caddyfile`) |

GCP에서 준비할 것:

| 항목 | 내용 |
| --- | --- |
| VM | `foonquer-api`, e2-small, Ubuntu 24.04, 디스크 20GB, 고정 외부 IP, 메타데이터 `enable-guest-attributes=TRUE`(배포 SSH가 VM 호스트 키를 확인한다). 액세스 범위(scope) `cloud-platform`으로 생성(기본 범위로는 Secret Manager를 부를 수 없다), Docker 설치, 배포용 사용자 `deploy`(docker 그룹). SSH 사용자가 암호 없이 `deploy`로 전환할 수 있어야 한다(`gcloud compute ssh` 사용자는 기본으로 된다) |
| 방화벽 | 80·443은 모두에게, 22는 IAP 대역(`35.235.240.0/20`)에만 |
| VM 서비스 계정 | `foonquer-vm`. `roles/secretmanager.secretAccessor`, 사진 두 버킷의 `roles/storage.objectAdmin`과 서명 권한 `roles/iam.serviceAccountTokenCreator`(자기 자신에게, 업로드 signed URL), 백업 버킷의 `roles/storage.objectCreator`·`roles/storage.objectViewer`(복구할 때 읽기) |
| Secret Manager | `foonquer-prod-env` — 운영 `.env` 내용 (아래 표) |
| Cloud Storage | 공개 사진 버킷(`GCS_BUCKET`, 프로필 `profile/{회원 id}/`·리뷰 사진)은 `allUsers` 읽기 허용, 영수증·현장·문의 사진은 공개하지 않는 별도 버킷에 둔다(`GCS_PRIVATE_BUCKET`, `receipt/`·`site/`·`inquiry/` 폴더). 브라우저에서 signed URL로 바로 올리므로(USER-02, UPLOAD-01) 두 버킷 모두 버킷 CORS에 웹 주소, `PUT`, 요청 헤더 `Content-Type`·`x-goog-content-length-range`·`x-goog-if-generation-match` 허용. DB 백업 버킷은 비공개, 30일 지나면 지우는 수명 주기 |
| 배포용 서비스 계정 | `foonquer-deploy`. GitHub Actions가 VM에 IAP로 SSH할 권한만 준다 (`roles/compute.instanceAdmin.v1`, `roles/iap.tunnelResourceAccessor`, `roles/iam.serviceAccountUser`). 키 파일은 만들지 않고 Workload Identity Federation으로 이 저장소(`foonquer/foonquer`)의 Actions만 이 계정을 쓸 수 있게 한다: 풀 `github`, 공급자 `foonquer`(발급자 `https://token.actions.githubusercontent.com`, 속성 매핑 `google.subject=assertion.sub,attribute.repository=assertion.repository`, 조건 `assertion.repository=='foonquer/foonquer'`), 그리고 `foonquer-deploy`에 연합 주체 `principalSet://iam.googleapis.com/projects/<프로젝트 번호>/locations/global/workloadIdentityPools/github/attribute.repository/foonquer/foonquer`의 `roles/iam.workloadIdentityUser`. VM이 한 대뿐인 프로젝트라 `instanceAdmin.v1`은 프로젝트 단위로 준다(`gcloud compute ssh`가 프로젝트 메타데이터도 읽는다). VM을 늘리면 그 VM으로 좁힌다 |

운영 `.env`(Secret Manager `foonquer-prod-env`)에 넣는 값 — 값은 로컬 `.env`와 같은 뜻이고, 운영에서 다른 것만 적었다:

| 변수 | 운영 값 |
| --- | --- |
| `NODE_ENV` | `production` |
| `API_DOMAIN` | `api.foonquer.me` (caddy 인증서 도메인) |
| `DATABASE_URL` | `mysql://foonquer:<MYSQL_PASSWORD>@db:3306/foonquer` (비밀번호에 `@ : / ? # %` 같은 문자가 있으면 이 자리에는 percent-encode한 값. 지금 값은 16진수라 그대로) |
| `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` | 각각 임의의 긴 문자열 (db 컨테이너가 처음 뜰 때 계정을 만든다. 나중에 바꾸려면 DB 안에서도 바꿔야 한다) |
| `CORS_ORIGINS` | `https://foonquer.me,https://www.foonquer.me` (www로 들어와도 API를 부를 수 있게) |
| `FRONTEND_URL` | `https://foonquer.me` |
| `API_BASE_URL` | `https://api.foonquer.me` |
| `TRUST_PROXY` | `1` (caddy 한 단계) |
| `COOKIE_SECURE` | `true` |
| `JWT_ACCESS_SECRET` | 32자 이상 임의 문자열 (로컬과 다르게) |
| `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET` | 카카오 개발자 콘솔 먹짱깨기 앱의 REST API 키와 카카오 로그인 Client Secret. 그 키에 카카오 로그인 리다이렉트 URI `https://api.foonquer.me/api/v1/auth/oauth/kakao/callback` 등록 |
| `KAKAO_LOCAL_API_KEY` | 카카오맵 무료 쿼터가 있는 앱의 REST API 키 `foonquer-server` (먹짱깨기 앱은 카카오맵을 켜면 유료라서) |
| `DATA_GO_KR_SERVICE_KEY` | 공공데이터포털 상가(상권)정보 API 활용신청 후 받은 일반 인증키 (Decoding) |
| `GCS_BUCKET`, `GCS_PRIVATE_BUCKET`, `IMAGE_BASE_URL` | 버킷 이름, `https://storage.googleapis.com/<공개 버킷>` |
| `CLOVA_OCR_URL`, `CLOVA_OCR_SECRET`, `GEMINI_API_KEY` | 각 콘솔 값 (비우면 그 기능만 꺼진다) |

GitHub에는 비밀값을 두지 않는다. 배포 대상(프로젝트·VM·영역·도메인)과 Workload Identity 공급자·배포용 서비스 계정 이름은 비밀이 아니라서 `.github/workflows/deploy.yml`의 `env`에 적어 두었다. 서버 비밀값은 모두 Secret Manager에만 있다.

DNS(Cloudflare > foonquer.me > DNS > Records). Cloudflare 프록시(주황 구름)는 끄고 **DNS only**로 둔다 (Caddy·Vercel이 직접 인증서를 받는다):

| 종류 | 이름 | 값 |
| --- | --- | --- |
| A | `api` | VM 고정 외부 IP (`foonquer-api-ip`) |
| A | `@` | Vercel이 알려 주는 값 (Vercel 프로젝트 > Settings > Domains) |
| CNAME | `www` | Vercel이 알려 주는 값 |

#### DB 백업

deploy 사용자 crontab에 넣는다. 예) 매일 새벽 3시 30분(KST)
`30 18 * * * ~/foonquer/scripts/backup-db.sh gs://<백업 버킷> >> ~/backup.log 2>&1`
되살리는 방법은 `scripts/backup-db.sh` 맨 위에 적어 두었다.

### 웹 (Vercel)

`web/`을 Vercel 프로젝트로 연결한다.

- Vercel에서 이 저장소를 가져오고 **Root Directory를 `web`** 으로 지정한다. pnpm 모노레포는 Vercel이 알아서 인식한다. Production Branch는 `develop`.
- 환경변수 `VITE_API_BASE_URL`=`https://api.foonquer.me`, `VITE_KAKAO_MAP_KEY`=카카오맵 무료 쿼터가 있는 앱의 JavaScript 키 `foonquer-web`.
- 도메인 `foonquer.me`(와 `www.foonquer.me`)를 연결한다. 카카오 개발자 콘솔 > 앱 > 플랫폼 키 > 그 JavaScript 키 > JavaScript SDK 도메인에 `https://foonquer.me`·`https://www.foonquer.me`가 있어야 지도가 뜬다.
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
