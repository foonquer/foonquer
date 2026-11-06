#!/usr/bin/env bash
# GitHub Actions가 gcloud compute ssh --tunnel-through-iap로 Compute Engine VM에서 실행하는
# 배포 스크립트 (워크플로가 이 파일을 stdin으로 넘긴다: ... --command 'bash -s' < scripts/deploy-remote.sh).
# 22번 포트는 IAP 대역(35.235.240.0/20)에만 열어 두고, 저장소와 docker compose는
# 배포용 사용자(deploy) 홈 디렉터리 기준이라 그 사용자 로그인 셸로 재실행한다.
# SSH 사용자는 암호 없이 deploy로 전환할 수 있어야 한다 (gcloud compute ssh 사용자는 기본으로
# google-sudoers 그룹이라 된다. 아니면 /etc/sudoers.d에 NOPASSWD로 추가).
#
# GHCR_ACTOR / GHCR_TOKEN / BUNDLE 자리(앞뒤 밑줄 두 개)는 워크플로에서 sed로 실제 값을 채워 넣는
# 플레이스홀더다 (GitHub Actions ${{ }} 치환은 이 파일엔 안 먹히므로).
#
# 저장소가 비공개라 VM에서 clone하지 않는다. 워크플로가 실행에 필요한 파일(docker-compose.yml,
# deploy/Caddyfile, scripts/backup-db.sh)만 묶어 BUNDLE 자리(tar.gz base64)에 넣어 보내고,
# ~/foonquer에 풀어 .env와 같이 둔다. 서버 이미지는 GitHub Actions에서 server/Dockerfile로 빌드해
# GHCR에 올리고, VM은 이미지를 pull만 한다.

set -e

if ! sudo -n -u deploy true 2>/dev/null; then
  echo "이 SSH 사용자는 암호 없이 deploy 사용자로 전환할 수 없어 배포를 멈춘다 (README 배포 참고)" >&2
  exit 1
fi

sudo -iu deploy bash -s <<'DEPLOY_SCRIPT'
set -e
mkdir -p ~/foonquer
cd ~/foonquer

echo '__BUNDLE__' | base64 -d | tar xzf -

# 운영 환경변수는 Secret Manager의 foonquer-prod-env 하나에 .env 파일 내용 그대로 둔다.
# VM 서비스 계정에 roles/secretmanager.secretAccessor가 필요하고, VM 액세스 범위(scope)가
# cloud-platform이어야 한다 (기본 범위로 만든 VM은 Secret Manager를 부를 수 없다).
# 비밀 값이 담기므로 임시 파일도 소유자만 읽게 만든다.
umask 077
if ! gcloud secrets versions access latest --secret=foonquer-prod-env > .env.new; then
  echo "Secret Manager fetch failed, aborting" >&2
  rm -f .env.new
  exit 1
fi

if [ ! -s .env.new ]; then
  echo "Secret Manager fetch failed or empty, aborting" >&2
  rm -f .env.new
  exit 1
fi
mv .env.new .env
chmod 600 .env

echo '__GHCR_TOKEN__' | docker login ghcr.io -u __GHCR_ACTOR__ --password-stdin

# --quiet: pull 진행률 로그가 길면 Actions 로그에서 뒤의 up -d/prune 결과를 찾기 어렵다.
docker compose pull --quiet

# 마이그레이션 전에 DB(같은 VM의 MySQL 컨테이너)를 띄우고 healthcheck가 통과할 때까지 기다린다.
# 처음 배포면 이때 빈 DB와 앱용 계정(MYSQL_USER)이 만들어진다.
docker compose up -d --wait db

# < /dev/null: docker compose run은 기본적으로 컨테이너 stdin을 호출한 셸의
# stdin에 그대로 연결한다. 이 스크립트 전체가 heredoc으로 stdin을 통해
# 들어오기 때문에, 이게 없으면 아래 run이 자기 뒤에 남은 스크립트 줄들을
# 자기 stdin으로 먹어버려서 seed/up -d가 아예 실행되지 않는다.
docker compose run --rm --no-deps app ./node_modules/.bin/prisma migrate deploy < /dev/null
docker compose run --rm --no-deps app npx prisma db seed < /dev/null

# --force-recreate: image: 필드 문자열(:latest)이 그대로면 compose가 pull로
# 받아온 새 이미지가 있어도 재생성을 건너뛰는 경우가 있어 명시적으로 강제한다.
docker compose up -d --force-recreate

docker image prune -f

echo "=== deployed image ==="
docker compose images
DEPLOY_SCRIPT
