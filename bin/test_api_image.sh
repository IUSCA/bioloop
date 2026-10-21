#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose-api-test.yml"
API_IMAGE_PROJECT="bioloop-api-image-$(date +%s)-$$"

cleanup() {
  local exit_code=$?
  trap - EXIT
  docker compose -p "$API_IMAGE_PROJECT" -f "$COMPOSE_FILE" down -v --remove-orphans --rmi local || true
  exit "$exit_code"
}
trap cleanup EXIT

docker compose -p "$API_IMAGE_PROJECT" -f "$COMPOSE_FILE" build api-image

# Generate test-only JWT keys in the isolated named volume, then start the
# image with its normal production CMD instead of overriding its entrypoint.
docker compose -p "$API_IMAGE_PROJECT" -f "$COMPOSE_FILE" run --rm --no-deps \
  --entrypoint sh api-image -c 'cd keys && sh genkeys.sh'

if ! docker compose -p "$API_IMAGE_PROJECT" -f "$COMPOSE_FILE" up -d --no-build --wait api-image; then
  docker compose -p "$API_IMAGE_PROJECT" -f "$COMPOSE_FILE" logs --no-color api-image || true
  exit 1
fi

echo 'Production API image is healthy.'
