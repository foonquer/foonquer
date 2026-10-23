# 먹장깨기 (foonquer)

방문 인증 리뷰 + 맛집 도장깨기 서비스. 캡스톤 디자인 3조.

## 구조

```
server/   Node.js + Express + Prisma (MySQL)
web/      React PWA
docs/     기획·ERD·API 문서
scripts/  EC2 배포 스크립트
```

## 규칙

- 브랜치: `main` ← `develop` ← `feat/#이슈번호/작업명`
- `develop`에는 PR로만 합친다. (`develop` push = 서버 배포)
- 커밋: `✨ Feat: 설명 (#이슈번호)` (Gitmoji)
- 이슈 제목: `[Feat] 작업 요약`

## 개발 환경

- Node 24.14.0, pnpm 10.12.1
- `pnpm install` 후 커밋하면 husky + lint-staged가 자동으로 돈다.
