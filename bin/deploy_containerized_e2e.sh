#!/bin/bash
#
# deploy_containerized_e2e.sh
#
# Starts all Docker Compose services for the E2E stack.
# Uses docker-compose-e2e.yml and the project name declared in that file.
#
# USAGE:
#   bin/deploy_containerized_e2e.sh           # start services, preserve state
#   bin/deploy_containerized_e2e.sh --fresh   # reset then start
#   bin/deploy_containerized_e2e.sh -f        # shorthand for --fresh

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

FRESH=false
[[ "${1:-}" == "--fresh" || "${1:-}" == "-f" ]] && FRESH=true

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

if ! grep -Eq 'APP_ENV=(docker|ci)' "${COMPOSE_FILE}"; then
  abort "APP_ENV=docker or APP_ENV=ci not found in docker-compose-e2e.yml."
fi

if ! docker info > /dev/null 2>&1; then
  abort "Docker is not running or not accessible. Start Docker Desktop and try again."
fi

if $FRESH; then
  info "--fresh: resetting E2E Docker environment before startup..."
  echo ""
  bash "${SCRIPT_DIR}/reset_docker_e2e.sh" --reset-all
  echo ""
  rm -f "${REPO_ROOT}/api/.db_seeded"
fi

info "Starting E2E services (detached)..."
docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" up -d

echo ""
success "E2E services started."
echo ""
info "Check status: docker compose -p ${COMPOSE_PROJECT} -f docker-compose-e2e.yml ps"
info "Follow logs:  docker compose -p ${COMPOSE_PROJECT} -f docker-compose-e2e.yml logs -f"
echo ""
