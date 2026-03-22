#!/bin/bash
#
# deploy_containerized_e2e.sh
#
# Starts all Docker Compose services for the bioloop e2e test stack
# (docker-compose-e2e.yml).
#
# By default, brings up services while preserving existing state.  Pass
# --fresh to wipe all Docker-managed e2e state first (equivalent to running
# reset_docker_e2e.sh --reset-all followed by docker compose up).
#
# The e2e service runs Playwright tests automatically once the api and ui
# services are healthy.  Follow its logs to watch progress:
#
#   docker compose -f docker-compose-e2e.yml logs -f e2e
#
# SAFETY:
#   - Requires Docker to be running (aborts otherwise).
#   - Only operates on the e2e compose project — the main dev stack is not
#     affected.
#
# USAGE:
#   bin/deploy_containerized_e2e.sh           # start e2e stack, preserve state
#   bin/deploy_containerized_e2e.sh --fresh   # reset e2e environment, then start
#   bin/deploy_containerized_e2e.sh -f        # shorthand for --fresh

set -euo pipefail

# ── helpers ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'
YEL='\033[1;33m'
GRN='\033[0;32m'
DIM='\033[2m'
NC='\033[0m'

info()    { echo -e "${DIM}[info]${NC}  $*"; }
warn()    { echo -e "${YEL}[warn]${NC}  $*"; }
success() { echo -e "${GRN}[ok]${NC}    $*"; }
abort()   { echo -e "${RED}[abort]${NC} $*"; exit 1; }

# ── args ──────────────────────────────────────────────────────────────────────

FRESH=false
[[ "${1:-}" == "--fresh" || "${1:-}" == "-f" ]] && FRESH=true

# ── guards ────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

COMPOSE_FILE="docker-compose-e2e.yml"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  abort "${COMPOSE_FILE} not found at ${REPO_ROOT}. Run this script from the repo root."
fi

COMPOSE_PROJECT=$(awk '/^name:/{print $2; exit}' "${COMPOSE_FILE}")
if [[ -z "${COMPOSE_PROJECT}" ]]; then
  abort "${COMPOSE_FILE} does not declare a 'name:' field."
fi

if ! docker info > /dev/null 2>&1; then
  abort "Docker is not running or not accessible. Start Docker Desktop and try again."
fi

# ── optional reset ────────────────────────────────────────────────────────────

if $FRESH; then
  info "--fresh: resetting e2e Docker environment before startup..."
  echo ""
  bash "${SCRIPT_DIR}/reset_docker_e2e.sh" --reset-all
  echo ""
  rm -f "${REPO_ROOT}/api/.db_seeded_e2e"
fi

# ── start services ────────────────────────────────────────────────────────────

info "Starting e2e stack (project: ${COMPOSE_PROJECT}, detached)..."
docker compose -f "${COMPOSE_FILE}" up -d

echo ""
success "E2e services started."
echo ""
info "Check status:    docker compose -f ${COMPOSE_FILE} ps"
info "Follow all logs: docker compose -f ${COMPOSE_FILE} logs -f"
info "Follow e2e tests: docker compose -f ${COMPOSE_FILE} logs -f e2e"
echo ""
info "On a first startup (or after --fresh), allow 2-5 minutes for:"
info "  - npm install + Vite dependency optimisation (ui service)"
info "  - database migrations and seed (api service)"
info "  - Playwright test run (e2e service waits for api + ui to be healthy)"
echo ""
