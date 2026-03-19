#!/bin/bash
#
# run_upload_tests.sh
#
# Runs all upload-related tests inside the e2e Docker Compose stack:
#   1) Worker pytest tests (via celery_worker container)
#   2) Playwright e2e tests (via ephemeral e2e container)
#
# Requires the e2e stack to be running (bin/deploy_containerized_e2e.sh).
#
set -euo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
DIM='\033[2m'
NC='\033[0m'

info()    { echo -e "${DIM}[info]${NC}  $*"; }
success() { echo -e "${GRN}[ok]${NC}    $*"; }
warn()    { echo -e "${YLW}[warn]${NC}  $*"; }
abort()   { echo -e "${RED}[fail]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose-e2e.yml"

[[ -f "${COMPOSE_FILE}" ]] || abort "Missing docker-compose-e2e.yml at ${REPO_ROOT}"

PROJECT_NAME="$(awk -F':' '/^name:/ {gsub(/[[:space:]]/, "", $2); print $2; exit}' "${COMPOSE_FILE}")"
[[ -n "${PROJECT_NAME}" ]] || abort "docker-compose-e2e.yml must declare a compose project name"

DC="docker compose -f ${COMPOSE_FILE} -p ${PROJECT_NAME}"

OVERALL_EXIT=0

# ---------------------------------------------------------------------------
# 1) Worker tests (pytest inside celery_worker)
# ---------------------------------------------------------------------------
echo ""
echo "========================================"
echo "  Worker upload tests (pytest)"
echo "========================================"
echo ""

if $DC ps --status running celery_worker 2>/dev/null | grep -q celery_worker; then
  info "Running pytest tests/upload/ inside celery_worker container"
  if $DC exec -T celery_worker pytest tests/upload/ -v; then
    success "Worker upload tests passed"
  else
    warn "Worker upload tests failed"
    OVERALL_EXIT=1
  fi
else
  warn "celery_worker container is not running — skipping worker tests"
  OVERALL_EXIT=1
fi

# ---------------------------------------------------------------------------
# 2) E2E tests (Playwright via ephemeral e2e container)
# ---------------------------------------------------------------------------
echo ""
echo "========================================"
echo "  E2E upload tests (Playwright)"
echo "========================================"
echo ""

UPLOAD_PROJECTS=(
  "upload"
  "upload_role_visibility"
  "upload--project_association--user_role--association"
)

cleanup_e2e_runner() {
  $DC rm -fsv e2e >/dev/null 2>&1 || true
  RUNNER_IDS="$(docker ps -aq \
    --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
    --filter "label=com.docker.compose.service=e2e" || true)"
  if [[ -n "${RUNNER_IDS}" ]]; then
    docker rm -f ${RUNNER_IDS} >/dev/null 2>&1 || true
  fi
}

trap cleanup_e2e_runner EXIT
cleanup_e2e_runner

PROJECT_ARGS=()
for p in "${UPLOAD_PROJECTS[@]}"; do
  PROJECT_ARGS+=(--project="${p}")
done

info "Running Playwright with projects: ${UPLOAD_PROJECTS[*]}"
if $DC run --rm --entrypoint "" \
  e2e /opt/sca/app/node_modules/.bin/playwright test "${PROJECT_ARGS[@]}"; then
  success "E2E upload tests passed"
else
  warn "E2E upload tests failed"
  OVERALL_EXIT=1
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
if [[ ${OVERALL_EXIT} -eq 0 ]]; then
  success "All upload tests passed"
else
  abort "Some upload tests failed (see output above)"
fi
