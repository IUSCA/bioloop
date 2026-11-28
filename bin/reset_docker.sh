#!/bin/bash
# reset_docker.sh
#
# Resets all Docker-managed state for this Bioloop instance: stops containers,
# removes named volumes, clears bind-mounted database data, and deletes all
# generated credentials, keys, and certs.  On the next `docker compose up`
# every service starts as if the Docker environment had never been brought up.
#
# This script only operates on Docker resources.  It does not affect source
# code, committed config files, or any non-Docker runtime.
#
# SAFETY:
#   - Requires Docker to be running (aborts otherwise).
#   - Verifies this is a Docker-mode Bioloop project before proceeding.
#   - The compose project name is read dynamically from the 'name:' field in
#     docker-compose.yml. All Docker operations are scoped to that project;
#     containers and volumes from other projects are never touched.
#   - You are prompted for confirmation before each destructive step.
#
# USAGE:
#   bin/reset_docker.sh              # interactive — prompts before each step
#   bin/reset_docker.sh --reset-all # non-interactive — skips all prompts
#   bin/reset_docker.sh -a          # shorthand for --reset-all

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
# This script only resets Docker-managed resources.  If Docker is not running
# there is nothing to reset and no point continuing.

if ! docker info > /dev/null 2>&1; then
  abort "Docker is not running or not accessible. Start Docker Desktop and try again."
fi

# ── guard: must run from repo root ───────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ ! -f "${REPO_ROOT}/docker-compose.yml" ]]; then
  abort "docker-compose.yml not found at ${REPO_ROOT}. Run this script from the repo root."
fi

# Read the compose project name directly from the file so this script stays
# in sync with docker-compose.yml without requiring manual updates.
COMPOSE_PROJECT=$(awk '/^name:/{print $2; exit}' "${REPO_ROOT}/docker-compose.yml")
if [[ -z "${COMPOSE_PROJECT}" ]]; then
  abort "docker-compose.yml does not declare a 'name:' field. Wrong repo or wrong branch?"
fi

# ── guard: verify this is a containerized project ────────────────────────────
# Confirm that the compose file configures services with APP_ENV=docker or
# APP_ENV=ci, meaning this is the Docker-based development/CI environment — not a
# bare-metal or VM-based deployment.

if ! grep -Eq 'APP_ENV=(docker|ci)' "${REPO_ROOT}/docker-compose.yml"; then
  abort "APP_ENV=docker or APP_ENV=ci not found in docker-compose.yml. This does not appear to be a containerized environment."
fi

cd "${REPO_ROOT}"
info "Working directory: ${REPO_ROOT}"
info "Compose project:   ${COMPOSE_PROJECT}"

# ── guard: refuse on production instances ────────────────────────────────────

if grep -rq "APP_ENV=production" api/.env workers/.env 2>/dev/null; then
  abort "APP_ENV=production detected in .env files. Refusing to reset a production instance."
fi

echo ""
echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║  WARNING: this will permanently delete all Docker-managed   ║${NC}"
echo -e "${RED}║  state for this Bioloop instance (databases, keys, credentials).  ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

confirm "Proceed with Docker environment reset?" || abort "Cancelled by user."

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Stop and remove containers (this project only).
#
# `docker compose down` is scoped to the compose project read from docker-compose.yml
# and will not affect containers from other projects.
# --remove-orphans cleans up containers whose service definitions were removed.
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "STEP 1 — Stop and remove containers (project: ${COMPOSE_PROJECT})"

if confirm "Stop all ${COMPOSE_PROJECT} containers?"; then
  docker compose down --remove-orphans
  success "Containers stopped and removed."
else
  warn "Skipped. Volumes and bind-mount data can still be cleaned, but database containers must be stopped first or data files may be locked."
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Remove Docker named volumes (this project only).
#
# Volumes are identified strictly by the compose project label so only volumes
# owned by this project are removed.  `docker volume prune` is NOT used
# because it would affect every Docker project on the machine.
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
# PostgreSQL and MongoDB persist data in host directories bind-mounted into
# their containers.  Docker writes these files as root, so a throwaway Alpine
# container is used to remove them — no host-level sudo required.
#
#   db/postgres/data — PostgreSQL cluster files
#   db/mongo/data    — MongoDB data files
#
# Effect: the next `docker compose up` starts with empty databases.
# Prisma migrations and mongo-init.js recreate the schema automatically.
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
# Written by api/bin/entrypoint.sh after a successful seed run.
if [[ -f "api/.db_seeded" ]]; then
  rm -f api/.db_seeded
  success "Removed api/.db_seeded (DB will be re-seeded on next startup)."
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Remove generated .env files.
#
# Entrypoint scripts write runtime credentials into .env files at startup.
# These are NOT committed to git — .env.default files are the templates.
# Removing them forces full credential re-generation on next startup.
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
#   api/keys/auth.key, api/keys/auth.pub
#     RSA key pair used by the API to sign and verify JWTs.
#     Bind-mounted from api/keys/ — removing forces regeneration on next start.
#     Rhythm keys are in the *_rhythm_keys named volume (removed in step 2).
#
#   ui/.cert/cert.pem, ui/.cert/key.pem
#     Self-signed TLS cert for the Nuxt dev server on port 443.
#     Bind-mounted from ui/.cert/ — removing forces regeneration on next start.
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
#   workers/celery_worker.pid
#     Written by Celery on startup into the bind-mounted ./workers/ directory.
#     Persists across container recreations.  If present when a new container
#     starts, Celery refuses to start: "Pidfile already exists".
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
# DONE
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GRN}═══════════════════════════════════════════════════════════════${NC}"
success "Docker environment reset complete."
echo -e "${GRN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
info "To bring the stack back up:"
echo "    docker compose up -d"
echo ""
info "Allow 1–2 minutes on first startup for keys, credentials, and"
info "database migrations to be generated.  Watch progress with:"
echo "    docker compose logs -f"
echo ""
