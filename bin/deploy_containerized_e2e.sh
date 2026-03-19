#!/bin/bash
#
# deploy_containerized_e2e.sh
#
# Starts the e2e Docker stack defined in docker-compose-e2e.yml after
# validating host-port safety.
#
# Safety checks:
#   1) Every host port in docker-compose-e2e.yml is free on this machine.
#   2) No host port in docker-compose-e2e.yml collides with host ports declared
#      by docker-compose files in sibling repos under /Users/ripandey/dev.
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

extract_host_ports() {
  local compose_path="$1"
  awk '
    {
      line=$0
      gsub(/^[ \t]+|[ \t]+$/, "", line)
      if (line ~ /^-[ \t]*"/) {
        sub(/^-[ \t]*"/, "", line)
        sub(/"$/, "", line)
      } else if (line ~ /^-[ \t]*/) {
        sub(/^-[ \t]*/, "", line)
      } else {
        next
      }

      if (line ~ /^[0-9.]+:[0-9]+:[0-9]+$/) {
        n=split(line, a, ":")
        print a[2]
      } else if (line ~ /^[0-9]+:[0-9]+$/) {
        n=split(line, a, ":")
        print a[1]
      }
    }
  ' "${compose_path}" | sort -n | uniq
}

E2E_PORTS="$(extract_host_ports "${COMPOSE_FILE}")"
if [[ -z "${E2E_PORTS}" ]]; then
  abort "No host ports found in docker-compose-e2e.yml"
fi

info "Checking host listener conflicts for ports: ${E2E_PORTS//$'\n'/ }"
while IFS= read -r port; do
  [[ -z "${port}" ]] && continue
  if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN || true
    abort "Host port ${port} is already in use."
  fi
done <<< "${E2E_PORTS}"

info "Checking compose-port collisions across /Users/ripandey/dev"
COMPOSE_FILES="$(rg --files /Users/ripandey/dev -g "docker-compose*.yml" -g "docker-compose*.yaml" || true)"
if [[ -z "${COMPOSE_FILES}" ]]; then
  warn "No compose files found under /Users/ripandey/dev for collision scan."
else
  COLLISIONS=0
  while IFS= read -r compose; do
    [[ -z "${compose}" ]] && continue
    [[ "${compose}" == "${COMPOSE_FILE}" ]] && continue
    OTHER_PORTS="$(extract_host_ports "${compose}")"
    [[ -z "${OTHER_PORTS}" ]] && continue
    while IFS= read -r p; do
      [[ -z "${p}" ]] && continue
      while IFS= read -r op; do
        [[ -z "${op}" ]] && continue
        if [[ "${p}" == "${op}" ]]; then
          echo "  collision: port ${p} also declared in ${compose}"
          COLLISIONS=1
        fi
      done <<< "${OTHER_PORTS}"
    done <<< "${E2E_PORTS}"
  done <<< "${COMPOSE_FILES}"
  [[ ${COLLISIONS} -eq 0 ]] || abort "Port-collision check failed. Resolve compose port overlaps first."
fi

info "Starting e2e stack with project '${PROJECT_NAME}'"
docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" up -d

echo ""
success "E2E stack started."
info "Run tests with:"
echo "  docker compose -f docker-compose-e2e.yml -p ${PROJECT_NAME} run --rm e2e"
echo ""
