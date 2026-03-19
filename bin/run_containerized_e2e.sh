#!/bin/bash
#
# run_containerized_e2e.sh
#
# Runs Playwright tests in the E2E runner container and guarantees
# cleanup of only the test runner service/container when done.
#
# USAGE:
#   bin/run_containerized_e2e.sh
#   bin/run_containerized_e2e.sh -- --project=admin_notifications
#   bin/run_containerized_e2e.sh -- --grep "notifications"

set -euo pipefail

RED='\033[0;31m'
YEL='\033[1;33m'
GRN='\033[0;32m'
DIM='\033[2m'
NC='\033[0m'

info()    { echo -e "${DIM}[info]${NC}  $*"; }
warn()    { echo -e "${YEL}[warn]${NC}  $*"; }
success() { echo -e "${GRN}[ok]${NC}    $*"; }
abort()   { echo -e "${RED}[abort]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose-e2e.yml"
cd "${REPO_ROOT}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  abort "docker-compose-e2e.yml not found at ${REPO_ROOT}."
fi

COMPOSE_PROJECT=$(awk '/^name:/{print $2; exit}' "${COMPOSE_FILE}")
if [[ -z "${COMPOSE_PROJECT}" ]]; then
  abort "docker-compose-e2e.yml does not declare a 'name:' field."
fi

if ! docker info > /dev/null 2>&1; then
  abort "Docker is not running or not accessible. Start Docker Desktop and try again."
fi

cleanup_runner() {
  # Clean only the e2e test-runner service artifacts.
  docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" stop e2e > /dev/null 2>&1 || true
  docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" rm -f -s e2e > /dev/null 2>&1 || true
}
trap cleanup_runner EXIT

# Optional delimiter: everything after "--" is forwarded to Playwright.
FORWARDED_ARGS=()
if [[ "${1:-}" == "--" ]]; then
  shift
  FORWARDED_ARGS=("$@")
fi

info "Running tests in e2e service (auto-removing runner container)..."
if [[ ${#FORWARDED_ARGS[@]} -eq 0 ]]; then
  docker compose \
    -p "${COMPOSE_PROJECT}" \
    -f "${COMPOSE_FILE}" \
    --profile e2e-runner \
    run --rm e2e
else
  docker compose \
    -p "${COMPOSE_PROJECT}" \
    -f "${COMPOSE_FILE}" \
    --profile e2e-runner \
    run --rm e2e /opt/sca/app/node_modules/.bin/playwright test "${FORWARDED_ARGS[@]}"
fi

success "E2E test run complete; e2e runner service cleaned up."
