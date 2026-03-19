#!/bin/bash
#
# reset_docker_e2e.sh
#
# Stops and removes all containers, networks, and named volumes that belong to
# docker-compose-e2e.yml's compose project.
#
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

[[ -f "${COMPOSE_FILE}" ]] || abort "Missing docker-compose-e2e.yml at ${REPO_ROOT}"

PROJECT_NAME="$(awk -F':' '/^name:/ {gsub(/[[:space:]]/, "", $2); print $2; exit}' "${COMPOSE_FILE}")"
[[ -n "${PROJECT_NAME}" ]] || abort "docker-compose-e2e.yml must declare a compose project name via 'name: ...'"

if ! docker info >/dev/null 2>&1; then
  abort "Docker is not running or not accessible."
fi

info "Stopping and removing e2e resources for project '${PROJECT_NAME}'"
docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" down --remove-orphans --volumes

if [[ -f "${REPO_ROOT}/api/.db_seeded" ]]; then
  rm -f "${REPO_ROOT}/api/.db_seeded"
  info "Removed api/.db_seeded to force seed on next startup"
fi

success "E2E docker resources reset complete."
