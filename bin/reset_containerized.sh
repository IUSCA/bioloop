#!/bin/bash
# reset_containerized.sh
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
#   bin/reset_containerized.sh              # interactive — prompts before each step
#   bin/reset_containerized.sh --reset-all  # non-interactive — skips all prompts
#   bin/reset_containerized.sh -a           # shorthand for --reset-all

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/containerized_common.sh"
source "${SCRIPT_DIR}/lib/containerized_reset.sh"

# Read the compose project name directly from the file so this script stays
# in sync with docker-compose.yml without requiring manual updates.
setup_prompt_mode "${1:-}"
ensure_docker_running
init_repo_context "${BASH_SOURCE[0]}"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.yml"
ensure_compose_file_exists "${COMPOSE_FILE}"
COMPOSE_PROJECT="$(read_compose_project_from_file "${COMPOSE_FILE}")"
if [[ -z "${COMPOSE_PROJECT}" ]]; then
  abort "docker-compose.yml does not declare a 'name:' field. Wrong repo or wrong branch?"
fi

# ── guard: verify this is a containerized project ────────────────────────────
# Confirm that the compose file configures services with APP_ENV=docker or
# APP_ENV=ci, meaning this is the Docker-based development/CI environment — not a
# bare-metal or VM-based deployment.

ensure_compose_has_container_app_env "${COMPOSE_FILE}"

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

COMPOSE_CMD=(docker compose)
reset_step_stop_containers "${COMPOSE_PROJECT}" "${COMPOSE_CMD[@]}"
reset_step_remove_named_volumes "${COMPOSE_PROJECT}"
reset_step_remove_bind_db_data
reset_step_remove_runtime_files

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
