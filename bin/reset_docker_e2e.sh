#!/bin/bash
# reset_docker_e2e.sh
#
# Resets all Docker-managed state for the e2e test stack: stops containers,
# removes named volumes, clears bind-mounted database data, and deletes all
# generated credentials, keys, certs, and Playwright auth state.  On the
# next `docker compose -f docker-compose-e2e.yml up` every service starts as
# if the e2e environment had never been brought up.
#
# This script only operates on Docker resources and e2e test artifacts.  It
# does not affect source code or committed config files.
#
# SAFETY:
#   - Requires Docker to be running (aborts otherwise).
#   - Verifies this is the e2e compose file before proceeding.
#   - The compose project name is read dynamically from the 'name:' field in
#     docker-compose-e2e.yml.  All Docker operations are scoped to that
#     project; containers and volumes from other projects are never touched.
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

COMPOSE_FILE="${REPO_ROOT}/docker-compose-e2e.yml"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  abort "docker-compose-e2e.yml not found at ${REPO_ROOT}. Run this script from the repo root."
fi

# Read the compose project name directly from the file so this script stays
# in sync with docker-compose-e2e.yml without requiring manual updates.
COMPOSE_PROJECT=$(awk '/^name:/{print $2; exit}' "${COMPOSE_FILE}")
if [[ -z "${COMPOSE_PROJECT}" ]]; then
  abort "docker-compose-e2e.yml does not declare a 'name:' field. Wrong repo or wrong branch?"
fi

# ── guard: verify this is a containerized project ────────────────────────────

if ! grep -Eq 'APP_ENV=(docker|ci)' "${COMPOSE_FILE}"; then
  abort "APP_ENV=docker or APP_ENV=ci not found in docker-compose-e2e.yml. This does not appear to be a containerized environment."
fi

cd "${REPO_ROOT}"
info "Working directory: ${REPO_ROOT}"
info "Compose file:      docker-compose-e2e.yml"
info "Compose project:   ${COMPOSE_PROJECT}"

echo ""
echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║  WARNING: this will permanently delete all Docker-managed   ║${NC}"
echo -e "${RED}║  state for the e2e stack (databases, keys, test auth state). ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

confirm "Proceed with e2e Docker environment reset?" || abort "Cancelled by user."

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Stop and remove containers (this project only).
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "STEP 1 — Stop and remove containers (project: ${COMPOSE_PROJECT})"

if confirm "Stop all ${COMPOSE_PROJECT} containers?"; then
  docker compose -f "${COMPOSE_FILE}" down --remove-orphans
  success "Containers stopped and removed."
else
  warn "Skipped. Volumes and bind-mount data can still be cleaned, but database containers must be stopped first or data files may be locked."
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Remove Docker named volumes (this project only).
#
# Volumes removed (when present, prefixed by the compose project name):
#   *_rhythm_keys               — RSA signing keys for Rhythm JWT service
#   *_signet_db                 — PostgreSQL data for Signet OAuth service
#   *_queue_volume              — RabbitMQ message queue state
#   *_landing_volume            — shared file-storage area
#   *_docs_modules              — node_modules cache for docs service
#   *_grafana_data              — Grafana dashboards (metrics profile)
#   *_prometheus_data           — Prometheus time-series data (metrics profile)
#   *_api_node_modules          — cached npm packages for api
#   *_ui_node_modules           — cached npm packages for ui
#   *_secure_download_node_modules — cached npm packages for secure_download
#   *_test_modules              — cached npm packages for the e2e test runner
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
# STEP 3 — Remove bind-mounted database data directories.
#
#   db/postgres/data — PostgreSQL cluster files
#   db/mongo/data    — MongoDB data files
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "STEP 3 — Remove bind-mounted database data"

_remove_db_dir() {
  local full_path="$1"
  local parent_dir child_dir
  parent_dir="$(dirname "${full_path}")"
  child_dir="$(basename "${full_path}")"
  docker run --rm \
    -v "$(pwd)/${parent_dir}:/mnt" \
    alpine \
    rm -rf "/mnt/${child_dir}"
}

for DATA_DIR in db/postgres/data db/mongo/data; do
  if [[ -d "${DATA_DIR}" ]]; then
    if confirm "Remove ${DATA_DIR}/?"; then
      _remove_db_dir "${DATA_DIR}"
      success "Removed ${DATA_DIR}/"
    else
      warn "Skipped ${DATA_DIR}/."
    fi
  else
    info "${DATA_DIR}/ does not exist. Nothing to remove."
  fi
done

# Remove the seed marker so the DB is re-seeded on next startup.
if [[ -f "api/.db_seeded" ]]; then
  rm -f api/.db_seeded
  success "Removed api/.db_seeded (DB will be re-seeded on next startup)."
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Remove generated .env files.
#
#   api/.env     — WORKFLOW_AUTH_TOKEN, OAuth client credentials
#   workers/.env — APP_API_TOKEN
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "STEP 4 — Remove generated .env files"

for ENV_FILE in api/.env workers/.env; do
  if [[ -f "${ENV_FILE}" ]]; then
    if confirm "Remove ${ENV_FILE}?"; then
      rm -f "${ENV_FILE}"
      success "Removed ${ENV_FILE}."
    else
      warn "Skipped ${ENV_FILE}."
    fi
  else
    info "${ENV_FILE} does not exist. Nothing to remove."
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Remove generated keys and certificates.
#
#   api/keys/auth.key, api/keys/auth.pub — RSA key pair for JWT signing
#   ui/.cert/cert.pem, ui/.cert/key.pem  — self-signed TLS cert for UI
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "STEP 5 — Remove generated keys and certificates"

KEY_FILES=(
  "api/keys/auth.key"
  "api/keys/auth.pub"
  "ui/.cert/cert.pem"
  "ui/.cert/key.pem"
)

FILES_TO_REMOVE=()
for f in "${KEY_FILES[@]}"; do
  [[ -f "$f" ]] && FILES_TO_REMOVE+=("$f")
done

if [[ ${#FILES_TO_REMOVE[@]} -eq 0 ]]; then
  info "No key/cert files found. Nothing to remove."
else
  echo "  Files to be removed:"
  printf "    %s\n" "${FILES_TO_REMOVE[@]}"

  if confirm "Remove the above keys and certs?"; then
    rm -f "${FILES_TO_REMOVE[@]}"
    success "Keys and certs removed."
  else
    warn "Skipped key/cert removal."
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — Remove stale runtime files.
#
#   workers/celery_worker.pid — Celery PID file; presence prevents restart.
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "STEP 6 — Remove stale runtime files"

if [[ -f "workers/celery_worker.pid" ]]; then
  rm -f workers/celery_worker.pid
  success "Removed workers/celery_worker.pid."
else
  info "workers/celery_worker.pid does not exist. Nothing to remove."
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — Remove Playwright auth state and test artifacts.
#
#   tests/.auth/          — saved browser storage state (login sessions)
#   tests/playwright-report/ — HTML test report from the last run
#   tests/test-results/   — per-test screenshots, traces, and videos
#
# Removing auth state forces the login setup projects to re-authenticate on
# the next test run, which is required after a database reset.
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "STEP 7 — Remove Playwright auth state and test artifacts"

E2E_ARTIFACT_DIRS=(
  "tests/.auth"
  "tests/playwright-report"
  "tests/test-results"
)

E2E_DIRS_TO_REMOVE=()
for d in "${E2E_ARTIFACT_DIRS[@]}"; do
  [[ -d "$d" ]] && E2E_DIRS_TO_REMOVE+=("$d")
done

if [[ ${#E2E_DIRS_TO_REMOVE[@]} -eq 0 ]]; then
  info "No Playwright artifact directories found. Nothing to remove."
else
  echo "  Directories to be removed:"
  printf "    %s\n" "${E2E_DIRS_TO_REMOVE[@]}"

  if confirm "Remove the above Playwright artifact directories?"; then
    rm -rf "${E2E_DIRS_TO_REMOVE[@]}"
    success "Playwright artifacts removed."
  else
    warn "Skipped Playwright artifact removal."
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# DONE
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GRN}═══════════════════════════════════════════════════════════════${NC}"
success "e2e Docker environment reset complete."
echo -e "${GRN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
info "To bring the e2e stack back up:"
echo "    docker compose -f docker-compose-e2e.yml up -d"
echo "    # or:"
echo "    bin/deploy_containerized_e2e.sh"
echo ""
info "Allow 1–2 minutes on first startup for keys, credentials, and"
info "database migrations to be generated.  Watch progress with:"
echo "    docker compose -f docker-compose-e2e.yml logs -f"
echo ""
