#!/bin/bash
#
# reset_containerized_e2e.sh
#
# Resets Docker-managed state for the E2E stack (docker-compose-e2e.yml):
# - Stops/removes containers for the E2E project
# - Removes project-scoped named volumes
# - Removes bind-mounted DB data dirs
# - Removes generated keys/certs and stale runtime files
#
# USAGE:
#   bin/reset_containerized_e2e.sh              # interactive
#   bin/reset_containerized_e2e.sh --reset-all  # non-interactive
#   bin/reset_containerized_e2e.sh -a

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/containerized_common.sh"
source "${SCRIPT_DIR}/lib/containerized_reset.sh"

setup_prompt_mode "${1:-}"
ensure_docker_running
init_repo_context "${BASH_SOURCE[0]}"
COMPOSE_FILE="${REPO_ROOT}/docker-compose-e2e.yml"

ensure_compose_file_exists "${COMPOSE_FILE}"

COMPOSE_PROJECT="$(read_compose_project_from_file "${COMPOSE_FILE}")"
if [[ -z "${COMPOSE_PROJECT}" ]]; then
  abort "docker-compose-e2e.yml does not declare a 'name:' field."
fi

ensure_compose_has_container_app_env "${COMPOSE_FILE}"

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

COMPOSE_CMD=(docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}")
reset_step_stop_containers "${COMPOSE_PROJECT}" "${COMPOSE_CMD[@]}"
reset_step_remove_named_volumes "${COMPOSE_PROJECT}"
reset_step_remove_bind_db_data
reset_step_remove_runtime_files

echo ""
echo -e "${GRN}═══════════════════════════════════════════════════════════════${NC}"
success "E2E Docker environment reset complete."
echo -e "${GRN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
info "To bring the E2E stack back up:"
echo "    docker compose -p ${COMPOSE_PROJECT} -f docker-compose-e2e.yml up -d"
echo ""
