#!/bin/bash
#
# run_e2e_tests.sh
#
# Runs Playwright tests in the e2e service container and always removes
# test-runner containers afterward, without touching the rest of the stack.
#
set -euo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
DIM='\033[2m'
NC='\033[0m'

info()    { echo -e "${DIM}[info]${NC}  $*"; }
success() { echo -e "${GRN}[ok]${NC}    $*"; }
abort()   { echo -e "${RED}[abort]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose-e2e.yml"

[[ -f "${COMPOSE_FILE}" ]] || abort "Missing docker-compose-e2e.yml at ${REPO_ROOT}"

PROJECT_NAME="$(awk -F':' '/^name:/ {gsub(/[[:space:]]/, "", $2); print $2; exit}' "${COMPOSE_FILE}")"
[[ -n "${PROJECT_NAME}" ]] || abort "docker-compose-e2e.yml must declare a compose project name via 'name: ...'"

cleanup_e2e_runner() {
  docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" rm -fsv e2e >/dev/null 2>&1 || true
  RUNNER_IDS="$(docker ps -aq \
    --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
    --filter "label=com.docker.compose.service=e2e" || true)"
  if [[ -n "${RUNNER_IDS}" ]]; then
    docker rm -f ${RUNNER_IDS} >/dev/null 2>&1 || true
  fi
}

trap cleanup_e2e_runner EXIT

cleanup_e2e_runner

if [[ $# -eq 0 ]]; then
  info "No args provided, running full Playwright suite."
  TEST_ARGS=(test)
else
  TEST_ARGS=("$@")
fi

info "Running e2e tests in ephemeral runner container"
COMPOSE_PROFILES="${COMPOSE_PROFILES:-e2e-runner}" docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" run --rm --entrypoint "" \
  e2e /opt/sca/app/node_modules/.bin/playwright "${TEST_ARGS[@]}"

success "E2E run finished; test-runner container removed."
