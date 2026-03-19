#!/bin/bash
#
# deploy_containerized.sh
#
# Starts all Docker Compose services for this Bioloop instance.
#
# By default, brings up services while preserving existing state (databases,
# volumes, credentials).  Pass --fresh to wipe all Docker-managed state first
# and start from a clean environment, equivalent to running docker-reset.sh
# followed by docker compose up.
#
# SAFETY:
#   - Requires Docker to be running (aborts otherwise).
#   - Verifies this is a Docker-mode Bioloop project before proceeding.
#
# USAGE:
#   bin/deploy_containerized.sh           # start services, preserve existing state
#   bin/deploy_containerized.sh --fresh   # reset environment, then start services
#   bin/deploy_containerized.sh -f        # shorthand for --fresh

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

if [[ ! -f "docker-compose.yml" ]]; then
  abort "docker-compose.yml not found at ${REPO_ROOT}. Run this script from the repo root."
fi

# Read the compose project name dynamically so this script stays in sync with
# docker-compose.yml without requiring manual updates.
COMPOSE_PROJECT=$(awk '/^name:/{print $2; exit}' "docker-compose.yml")
if [[ -z "${COMPOSE_PROJECT}" ]]; then
  abort "docker-compose.yml does not declare a 'name:' field. Wrong repo or wrong branch?"
fi

# Confirm this is a containerized project before doing anything.
if ! grep -Eq 'APP_ENV=(docker|ci)' "docker-compose.yml"; then
  abort "APP_ENV=docker or APP_ENV=ci not found in docker-compose.yml. This does not appear to be a containerized environment."
fi

if ! docker info > /dev/null 2>&1; then
  abort "Docker is not running or not accessible. Start Docker Desktop and try again."
fi

# ── optional reset ────────────────────────────────────────────────────────────

if $FRESH; then
  info "--fresh: resetting Docker environment before startup..."
  echo ""
  bash "${SCRIPT_DIR}/reset_docker.sh" --reset-all
  echo ""
  # Ensure the seed marker is gone even if reset_docker.sh exited early
  # (e.g. interactive mode with DB step skipped, or a partial failure).
  # The API entrypoint gates on this file — without removing it, the DB
  # would not be re-seeded on the next startup despite a fresh DB.
  rm -f "${REPO_ROOT}/api/.db_seeded"
fi

# ── start services ────────────────────────────────────────────────────────────

info "Starting all services (detached)..."
docker compose up -d

echo ""
success "Services started."
echo ""
info "Check status:    docker compose ps"
info "Follow logs:     docker compose logs -f"
echo ""
info "On a first startup (or after --fresh), allow 1-2 minutes for key and"
info "credential generation, npm installs, and database migrations to complete."
echo ""
