# syntax=docker/dockerfile:1
# 빌드 컨텍스트는 저장소 루트다. (docker build -f server/Dockerfile .)
# pnpm-lock.yaml과 pnpm-workspace.yaml이 루트에 있어서 server/만 컨텍스트로 잡으면 설치할 수 없다.

FROM node:24.14.0-alpine AS builder

WORKDIR /app

# 루트 package.json의 prepare(husky)는 컨테이너 안에 .git이 없어 실패하므로 건너뛴다.
ENV HUSKY=0

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY server/package.json ./server/package.json
# web/에 package.json이 생기면 아래 줄을 살린다. (lockfile에 web이 들어가면 frozen 설치에 필요)
# COPY web/package.json ./web/package.json

# postinstall(prisma generate)이 쓰는 파일만 먼저 복사해서 의존성 설치 캐시를 살린다.
COPY server/prisma ./server/prisma
COPY server/prisma.config.ts ./server/prisma.config.ts

RUN pnpm install --frozen-lockfile --filter ./server...

COPY server ./server

RUN pnpm --filter ./server run build

FROM node:24.14.0-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# pnpm workspace는 루트 node_modules(실제 패키지)와 server/node_modules(심볼릭 링크)를 함께 써서 둘 다 복사한다.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/server/node_modules ./server/node_modules
COPY --from=builder --chown=node:node /app/server/dist ./server/dist
COPY --from=builder --chown=node:node /app/server/prisma ./server/prisma
COPY --from=builder --chown=node:node /app/server/prisma.config.ts ./server/prisma.config.ts
COPY --from=builder --chown=node:node /app/server/package.json ./server/package.json
COPY --from=builder --chown=node:node /app/server/src/generated ./server/src/generated

WORKDIR /app/server

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/v1/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "dist/src/main"]
