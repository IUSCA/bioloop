#!/usr/bin/env bash
# Source this file only from the trusted orchestration checkout.
set -euo pipefail
export PREVIEW_TOOLS_DIR
PREVIEW_TOOLS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export PREVIEW_SOURCE_DIR="${PREVIEW_SOURCE_DIR:?Set PREVIEW_SOURCE_DIR to the application checkout}"
export PREVIEW_STATE_DIR="${PREVIEW_STATE_DIR:?Set PREVIEW_STATE_DIR outside the source checkout}"
export COMPOSE_PROJECT_NAME="bioloop-preview-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
export COMPOSE_PARALLEL_LIMIT=1
export COMPOSE_BAKE=false
compose() {
  docker compose --env-file /dev/null --project-name "$COMPOSE_PROJECT_NAME" \
    --file "$PREVIEW_TOOLS_DIR/../../docker-compose-preview.yml" "$@"
}
