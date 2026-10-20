#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
umask 077
python3 "$PREVIEW_TOOLS_DIR/prepare.py"
mkdir -p "$PREVIEW_STATE_DIR/output"
python3 "$PREVIEW_TOOLS_DIR/fetch-dependencies.py"
compose config --quiet

# Serial builds keep the UI compiler and Python installs from competing for RAM.
compose build
compose up -d --wait --wait-timeout 180 postgres signet_db mongo queue
compose run --rm --no-deps -T init_data_dirs
compose up -d --wait --wait-timeout 180 rhythm signet
compose run --rm --no-deps -T rhythm python -c 'from rhythm_api.config import config; assert config["auth"]["jwt"]'
compose run --rm --no-deps -T rhythm python -m rhythm_api.scripts.issue_token \
  --sub bioloop-dev.sca.iu.edu --expires_in 10800 > "$PREVIEW_STATE_DIR/workflow-token"
python3 "$PREVIEW_TOOLS_DIR/configure.py" workflow-token
compose run --rm --no-deps -T api npx prisma migrate deploy
compose run --rm --no-deps -T api npx prisma db seed
# The host reads this private output next. Match its UID/GID so a Linux runner
# can read the mode-0600 file instead of receiving a root-owned credential file.
compose run --rm --no-deps -T --user "$(id -u):$(id -g)" \
  -v "$PREVIEW_STATE_DIR/output:/preview-output" api node /preview/bootstrap.mjs
python3 "$PREVIEW_TOOLS_DIR/configure.py" bootstrap
compose up -d --wait --wait-timeout 180 api secure_download
compose up -d celery_worker watch upload_poller
compose up -d --wait --wait-timeout 180 ui
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8080/api/health > /dev/null
compose exec -T api node /preview/smoke.mjs
compose ps
docker stats --no-stream --format '{{.Name}}: {{.MemUsage}}' $(compose ps -q)
df -h /
