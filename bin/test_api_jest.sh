#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose-api-test.yml"
API_TEST_PROJECT="bioloop-api-test-$(date +%s)-$$"

cleanup() {
  local exit_code=$?
  trap - EXIT
  docker compose -p "$API_TEST_PROJECT" -f "$COMPOSE_FILE" down -v --remove-orphans --rmi local || true
  exit "$exit_code"
}
trap cleanup EXIT

docker compose -p "$API_TEST_PROJECT" -f "$COMPOSE_FILE" up -d --wait postgres
docker compose -p "$API_TEST_PROJECT" -f "$COMPOSE_FILE" build api-test
docker compose -p "$API_TEST_PROJECT" -f "$COMPOSE_FILE" run --rm --no-deps api-test "$@"
