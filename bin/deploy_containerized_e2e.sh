#!/bin/bash
#
# deploy_containerized_e2e.sh
#
# Starts all Docker Compose services for the E2E stack.
# Uses docker-compose-e2e.yml and the project name declared in that file.

# Before startup (always, even without --fresh), this script checks host ports
# used by docker-compose-e2e.yml. If defaults are busy, it finds free ports
# without killing existing processes, rewrites compose + test/UI config values,
# and then starts the stack.
#
# USAGE:
#   bin/deploy_containerized_e2e.sh           # start services, preserve state
#   bin/deploy_containerized_e2e.sh --fresh   # reset then start
#   bin/deploy_containerized_e2e.sh -f        # shorthand for --fresh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/containerized_common.sh"
source "${SCRIPT_DIR}/lib/containerized_ports.sh"

FRESH=false
[[ "${1:-}" == "--fresh" || "${1:-}" == "-f" ]] && FRESH=true

init_repo_context "${BASH_SOURCE[0]}"
COMPOSE_FILE="${REPO_ROOT}/docker-compose-e2e.yml"
cd "${REPO_ROOT}"

ensure_compose_file_exists "${COMPOSE_FILE}"

COMPOSE_PROJECT="$(read_compose_project_from_file "${COMPOSE_FILE}")"
if [[ -z "${COMPOSE_PROJECT}" ]]; then
  abort "docker-compose-e2e.yml does not declare a 'name:' field."
fi

ensure_compose_has_container_app_env "${COMPOSE_FILE}"
ensure_docker_running

# ── port availability + rewrites (always) ────────────────────────────────────
#
# We proactively ensure host-published ports are free before startup.
# If a default host port is occupied, we select the next free host port and
# rewrite compose + dependent app/test config so the stack remains usable.
# This runs whether or not --fresh is passed.
assign_ports_for_stack "e2e"
apply_stack_port_rewrites \
  "e2e" \
  "${COMPOSE_FILE}" \
  "${REPO_ROOT}" \
  "${UI_PORT}" \
  "${POSTGRES_PORT}" \
  "${RABBITMQ_MGMT_PORT}" \
  "${MONGO_PORT}" \
  "${DOCS_PORT}" \
  "${JUPYTER_PORT}" \
  "${GRAFANA_PORT}"

if $FRESH; then
  info "--fresh: resetting E2E Docker environment before startup..."
  echo ""
  bash "${SCRIPT_DIR}/reset_containerized_e2e.sh" --reset-all
  echo ""
  rm -f "${REPO_ROOT}/api/.db_seeded"
fi

info "Starting E2E services (detached, excluding e2e test runner)..."
docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" up -d

echo ""
success "E2E services started."
echo ""
info "Check status: docker compose -p ${COMPOSE_PROJECT} -f docker-compose-e2e.yml ps"
info "Follow logs:  docker compose -p ${COMPOSE_PROJECT} -f docker-compose-e2e.yml logs -f"
info "Run tests:    bin/run_containerized_e2e.sh [-- <playwright args>]"
echo ""

print_ui_url_banner "${UI_PORT}"
print_port_changes_banner "${PORT_CHANGES[@]}"
