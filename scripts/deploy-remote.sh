#!/usr/bin/env bash
# GitHub Actions가 aws ssm send-command(AWS-RunShellScript)로 EC2에서 실행하는
# 배포 스크립트. SSM Run Command는 기본적으로 root로 실행되므로, ec2-user
# 홈 디렉터리 기준 경로(git 저장소, docker compose)를 그대로 쓰기 위해
# ec2-user 로그인 셸로 재실행한다.
#
# __GHCR_ACTOR__ / __GHCR_TOKEN__ 는 워크플로에서 sed로 실제 값을 채워 넣는
# 플레이스홀더다 (GitHub Actions ${{ }} 치환은 이 파일엔 안 먹히므로).
#
# 모노레포: 저장소 루트(~/foonquer)에 docker-compose.yml과 .env가 있고,
# 서버 이미지는 GitHub Actions에서 server/Dockerfile로 빌드해 GHCR에 올린다.
# EC2는 이미지를 pull만 한다.

set -e

sudo -iu ec2-user bash -s <<'DEPLOY_SCRIPT'
set -e
cd ~/foonquer

git fetch origin
git checkout develop
git pull origin develop

aws ssm get-parameters-by-path --path "/foonquer/prod" --with-decryption \
  --region ap-northeast-2 --query "Parameters[*].[Name,Value]" --output text \
  | awk -F'\t' '{ n=split($1,a,"/"); print a[n]"="$2 }' > .env.new

if [ ! -s .env.new ]; then
  echo "SSM Parameter Store fetch failed or empty, aborting" >&2
  rm -f .env.new
  exit 1
fi
mv .env.new .env
chmod 600 .env

echo '__GHCR_TOKEN__' | docker login ghcr.io -u __GHCR_ACTOR__ --password-stdin

# --quiet: SSM Run Command는 stdout을 약 24KB에서 잘라버려서, pull 진행률
# 로그가 길면 뒤에 나오는 up -d/prune 결과가 잘려서 안 보이게 된다.
docker compose pull --quiet

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
