#!/bin/bash
# reset_docker_e2e.sh
#
# Resets all Docker-managed state for the e2e test stack (docker-compose-e2e.yml).
# Stops containers, removes named volumes, and clears the e2e-specific DB seed
# marker.  On the next `docker compose -f docker-compose-e2e.yml up`, every
# service starts with an empty database and fresh credentials.
#
# The e2e stack uses named volumes for Postgres and Mongo (not bind mounts),
# so no host-side directory deletion is required.  Keys, certs, and .env files
# in api/ and workers/ are shared with the main dev stack and are not touched.
#
# SAFETY:
#   - Requires Docker to be running (aborts otherwise).
#   - All Docker operations are scoped to the e2e compose project read from
#     docker-compose-e2e.yml — containers and volumes from other projects are
#     never touched.
#   - You are prompted for confirmation before each destructive step.
#
# USAGE:
#   bin/reset_docker_e2e.sh              # interactive — prompts before each step
#   bin/reset_docker_e2e.sh --reset-all  # non-interactive — skips all prompts
#   bin/reset_docker_e2e.sh -a           # shorthand for --reset-all

set -euo pipefail

# ── helpers ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
YEL='\033[1;33m'
GRN='\033[0;32m'
DIM='\033[2m'
NC='\033[0m'

info()    { echo -e "${DIM}[info]${NC}  $*"; }
warn()    { echo -e "${YEL}[warn]${NC}  $*"; }
success() { echo -e "${GRN}[ok]${NC}    $*"; }
abort()   { echo -e "${RED}[abort]${NC} $*"; exit 1; }

SKIP_PROMPTS=false
[[ "${1:-}" == "--reset-all" || "${1:-}" == "-a" ]] && SKIP_PROMPTS=true

confirm() {
  if $SKIP_PROMPTS; then return 0; fi
  echo ""
  read -rp "  $1  [y/N] " ans
  [[ "$(echo "${ans}" | tr '[:upper:]' '[:lower:]')" == "y" ]]
}

# ── guard: Docker must be running ────────────────────────────────────────────

if ! docker info > /dev/null 2>&1; then
  abort "Docker is not running or not accessible. Start Docker Desktop and try again."
fi

# ── guard: must run from repo root ───────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ ! -f "${REPO_ROOT}/docker-compose-e2e.yml" ]]; then
  abort "docker-compose-e2e.yml not found at ${REPO_ROOT}. Run this script from the repo root."
fi

COMPOSE_FILE="${REPO_ROOT}/docker-compose-e2e.yml"
COMPOSE_PROJECT=$(awk '/^name:/{print $2; exit}' "${COMPOSE_FILE}")
if [[ -z "${COMPOSE_PROJECT}" ]]; then
  abort "docker-compose-e2e.yml does not declare a 'name:' field."
fi

cd "${REPO_ROOT}"
info "Working directory: ${REPO_ROOT}"
info "E2e compose project: ${COMPOSE_PROJECT}"

echo ""
echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║  WARNING: this will permanently delete Docker-managed state  ║${NC}"
echo -e "${RED}║  for the e2e stack (databases, named volumes).               ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

confirm "Proceed with e2e Docker environment reset?" || abort "Cancelled by user."

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Stop and remove containers (e2e project only).
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "STEP 1 — Stop and remove containers (project: ${COMPOSE_PROJECT})"

if confirm "Stop all ${COMPOSE_PROJECT} containers?"; then
  docker compose -f "${COMPOSE_FILE}" down --remove-orphans
  success "Containers stopped and removed."
else
  warn "Skipped. Named volumes can still be removed but any running containers may hold locks."
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Remove named volumes (e2e project only).
#
# The e2e stack uses named volumes for all stateful services:
#   *_e2e_postgres_data   — PostgreSQL data
#   *_e2e_mongo_data      — MongoDB data
#   *_api_node_modules    — cached npm packages for api
#   *_ui_node_modules     — cached npm packages for ui
#   *_secure_download_node_modules
#   *_rhythm_keys         — Rhythm JWT signing keys
#   *_queue_volume        — RabbitMQ state
#   *_signet_db           — Signet DB
#   *_landing_volume      — shared file-storage
#   *_test_modules        — cached npm packages for test runner
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "STEP 2 — Remove Docker named volumes (project: ${COMPOSE_PROJECT})"

VOLUMES=$(docker volume ls \
  --filter "label=com.docker.compose.project=${COMPOSE_PROJECT}" \
  --quiet)

if [[ -z "${VOLUMES}" ]]; then
  info "No named volumes found for project '${COMPOSE_PROJECT}'. Nothing to remove."
else
  echo "  Volumes to be removed:"
  echo "${VOLUMES}" | sed 's/^/    /'

  if confirm "Remove the above named volumes?"; then
    echo "${VOLUMES}" | xargs docker volume rm
    success "Named volumes removed."
  else
    warn "Skipped named volume removal."
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Remove the e2e DB seed marker.
#
# The API entrypoint writes this file after a successful seed run.  Without
# removing it, the next startup would skip re-seeding even with an empty DB.
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "STEP 3 — Remove e2e DB seed marker"

E2E_SEED_MARKER="api/.db_seeded_e2e"
if [[ -f "${E2E_SEED_MARKER}" ]]; then
  if confirm "Remove ${E2E_SEED_MARKER}?"; then
    rm -f "${E2E_SEED_MARKER}"
    success "Removed ${E2E_SEED_MARKER} (DB will be re-seeded on next startup)."
  else
    warn "Skipped. The e2e database will NOT be re-seeded on next startup."
  fi
else
  info "${E2E_SEED_MARKER} does not exist. Nothing to remove."
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Remove stale Celery PID file.
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "STEP 4 — Remove stale runtime files"

if [[ -f "workers/celery_worker.pid" ]]; then
  rm -f workers/celery_worker.pid
  success "Removed workers/celery_worker.pid."
else
  info "workers/celery_worker.pid does not exist. Nothing to remove."
fi

# ─────────────────────────────────────────────────────────────────────────────
# DONE
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GRN}═══════════════════════════════════════════════════════════════${NC}"
success "E2e Docker environment reset complete."
echo -e "${GRN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
info "To bring the e2e stack back up:"
echo "    docker compose -f docker-compose-e2e.yml up -d"
echo "  or:"
echo "    bin/deploy_containerized_e2e.sh"
echo ""
info "Allow 2–5 minutes on first startup for npm installs, Vite dependency"
info "optimisation, and database migrations to complete."
echo ""
