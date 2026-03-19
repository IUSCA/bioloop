#!/bin/bash
#
# reset_docker_e2e.sh
#
# Resets Docker-managed state for the E2E stack (docker-compose-e2e.yml):
# - Stops/removes containers for the E2E project
# - Removes project-scoped named volumes
# - Removes bind-mounted DB data dirs
# - Removes generated keys/certs and stale runtime files
#
# USAGE:
#   bin/reset_docker_e2e.sh              # interactive
#   bin/reset_docker_e2e.sh --reset-all  # non-interactive
#   bin/reset_docker_e2e.sh -a

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

SKIP_PROMPTS=false
[[ "${1:-}" == "--reset-all" || "${1:-}" == "-a" ]] && SKIP_PROMPTS=true

confirm() {
  if $SKIP_PROMPTS; then return 0; fi
  echo ""
  read -rp "  $1  [y/N] " ans
  [[ "$(echo "${ans}" | tr '[:upper:]' '[:lower:]')" == "y" ]]
}

if ! docker info > /dev/null 2>&1; then
  abort "Docker is not running or not accessible. Start Docker Desktop and try again."
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose-e2e.yml"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  abort "docker-compose-e2e.yml not found at ${REPO_ROOT}."
fi

COMPOSE_PROJECT=$(awk '/^name:/{print $2; exit}' "${COMPOSE_FILE}")
if [[ -z "${COMPOSE_PROJECT}" ]]; then
  abort "docker-compose-e2e.yml does not declare a 'name:' field."
fi

if ! grep -Eq 'APP_ENV=(docker|ci)' "${COMPOSE_FILE}"; then
  abort "APP_ENV=docker or APP_ENV=ci not found in docker-compose-e2e.yml."
fi

cd "${REPO_ROOT}"
info "Working directory: ${REPO_ROOT}"
info "Compose project:   ${COMPOSE_PROJECT}"

echo ""
echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║  WARNING: this will permanently delete E2E Docker-managed   ║${NC}"
echo -e "${RED}║  state for project '${COMPOSE_PROJECT}'.                    ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

confirm "Proceed with E2E Docker environment reset?" || abort "Cancelled by user."

echo ""
info "STEP 1 — Stop and remove containers (project: ${COMPOSE_PROJECT})"
if confirm "Stop all ${COMPOSE_PROJECT} containers?"; then
  docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" down --remove-orphans
  success "Containers stopped and removed."
else
  warn "Skipped container removal."
fi

echo ""
info "STEP 2 — Remove Docker named volumes (project: ${COMPOSE_PROJECT})"
VOLUMES=$(docker volume ls --filter "label=com.docker.compose.project=${COMPOSE_PROJECT}" --quiet)
if [[ -z "${VOLUMES}" ]]; then
  info "No named volumes found for project '${COMPOSE_PROJECT}'."
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

echo ""
info "STEP 3 — Remove bind-mounted database data"
_remove_db_dir() {
  local full_path="$1"
  local parent_dir child_dir
  parent_dir="$(dirname "${full_path}")"
  child_dir="$(basename "${full_path}")"
  docker run --rm -v "$(pwd)/${parent_dir}:/mnt" alpine rm -rf "/mnt/${child_dir}"
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

if [[ -f "api/.db_seeded" ]]; then
  rm -f api/.db_seeded
  success "Removed api/.db_seeded."
fi

echo ""
info "STEP 4 — Remove generated runtime files"
for ENV_FILE in api/.env workers/.env; do
  if [[ -f "${ENV_FILE}" ]]; then
    if confirm "Remove ${ENV_FILE}?"; then
      rm -f "${ENV_FILE}"
      success "Removed ${ENV_FILE}."
    else
      warn "Skipped ${ENV_FILE}."
    fi
  fi
done

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
if [[ ${#FILES_TO_REMOVE[@]} -gt 0 ]]; then
  echo "  Files to be removed:"
  printf "    %s\n" "${FILES_TO_REMOVE[@]}"
  if confirm "Remove the above keys and certs?"; then
    rm -f "${FILES_TO_REMOVE[@]}"
    success "Keys and certs removed."
  else
    warn "Skipped key/cert removal."
  fi
fi

if [[ -f "workers/celery_worker.pid" ]]; then
  rm -f workers/celery_worker.pid
  success "Removed workers/celery_worker.pid."
fi

echo ""
echo -e "${GRN}═══════════════════════════════════════════════════════════════${NC}"
success "E2E Docker environment reset complete."
echo -e "${GRN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
info "To bring the E2E stack back up:"
echo "    docker compose -p ${COMPOSE_PROJECT} -f docker-compose-e2e.yml up -d"
echo ""
