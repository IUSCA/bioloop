#!/bin/bash
#
# deploy_containerized_e2e.sh
#
# Starts all Docker Compose services for the e2e test stack.
#
# By default, brings up services while preserving existing state (databases,
# volumes, credentials).  Pass --fresh to wipe all Docker-managed state first
# and start from a clean environment, equivalent to running reset_docker_e2e.sh
# followed by docker compose up.
#
# SAFETY:
#   - Requires Docker to be running (aborts otherwise).
#   - Verifies this is the e2e compose file before proceeding.
#
# USAGE:
#   bin/deploy_containerized_e2e.sh           # start services, preserve existing state
#   bin/deploy_containerized_e2e.sh --fresh   # reset environment, then start services
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

# Read the compose project name dynamically so this script stays in sync with
# docker-compose-e2e.yml without requiring manual updates.
COMPOSE_PROJECT=$(awk '/^name:/{print $2; exit}' "${COMPOSE_FILE}")
if [[ -z "${COMPOSE_PROJECT}" ]]; then
  abort "${COMPOSE_FILE} does not declare a 'name:' field. Wrong repo or wrong branch?"
fi

# Confirm this is a containerized project before doing anything.
if ! grep -Eq 'APP_ENV=(docker|ci)' "${COMPOSE_FILE}"; then
  abort "APP_ENV=docker or APP_ENV=ci not found in ${COMPOSE_FILE}. This does not appear to be a containerized environment."
fi

if ! docker info > /dev/null 2>&1; then
  abort "Docker is not running or not accessible. Start Docker Desktop and try again."
fi

# ── optional reset ────────────────────────────────────────────────────────────

if $FRESH; then
  info "--fresh: resetting Docker environment before startup..."
  echo ""
  bash "${SCRIPT_DIR}/reset_docker_e2e.sh" --reset-all
  echo ""
  # Ensure the seed marker is gone even if reset_docker_e2e.sh exited early.
  # The API entrypoint gates on this file — without removing it, the DB
  # would not be re-seeded on the next startup despite a fresh DB.
  rm -f "${REPO_ROOT}/api/.db_seeded"
fi

# ── start services ────────────────────────────────────────────────────────────

info "Starting all services (detached)..."
docker compose -f "${COMPOSE_FILE}" up -d

echo ""
success "Services started (project: ${COMPOSE_PROJECT})."
echo ""
info "Check status:    docker compose -f ${COMPOSE_FILE} ps"
info "Follow logs:     docker compose -f ${COMPOSE_FILE} logs -f"
info "Follow e2e logs: docker logs ${COMPOSE_PROJECT}-e2e-1 -f"
echo ""
info "On a first startup (or after --fresh), allow 1-2 minutes for key and"
info "credential generation, npm installs, and database migrations to complete."
info "The e2e container will start automatically once the API and UI are healthy."
echo ""
