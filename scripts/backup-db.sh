#!/usr/bin/env bash
# 운영 DB(VM 안 MySQL 컨테이너)를 덤프해서 Cloud Storage 백업 버킷에 올린다.
# deploy 사용자 crontab에서 매일 돌린다 (README 배포 > DB 백업). VM 서비스 계정에 백업 버킷 쓰기 권한이 필요하다.
# 사용법: scripts/backup-db.sh gs://<백업 버킷>
# 되살리기 (VM에서, deploy 사용자로 ~/foonquer에서. VM 서비스 계정에 백업 버킷 읽기 권한이 있다):
#   gcloud storage cat gs://<버킷>/db/<파일>.sql.gz | gunzip \
#     | docker compose exec -T db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'

set -euo pipefail

BUCKET="${1:?백업 버킷 주소(gs://...)를 넘겨 주세요}"
cd ~/foonquer

name="foonquer-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
# 덤프가 끝까지 성공한 것만 올린다 (중간에 실패하면 반쯤 된 파일이 버킷에 남지 않게 먼저 파일로)
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
# --single-transaction: 서비스를 멈추지 않고 한 시점의 일관된 덤프 (InnoDB)
# 비밀번호는 컨테이너 안 환경변수로만 쓴다 (명령줄·로그에 남기지 않는다)
docker compose exec -T db sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --set-gtid-purged=OFF "$MYSQL_DATABASE"' \
  | gzip > "$tmp"
gcloud storage cp "$tmp" "$BUCKET/db/$name"

echo "backed up $BUCKET/db/$name"
