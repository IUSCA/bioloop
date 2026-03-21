#!/bin/bash
#
# deploy_containerized.sh
#
# Starts all Docker Compose services for this Bioloop instance.
#
# By default, brings up services while preserving existing state (databases,
# volumes, credentials).  Pass --fresh to wipe all Docker-managed state first
# and start from a clean environment, equivalent to running docker-reset.sh
# followed by docker compose up.
# 
# Before startup (always, even without --fresh), this script checks whether
# the default host ports used by docker-compose.yml are available. If any are
# busy, it finds free host ports (without killing existing processes), rewrites
# the relevant compose/app/test config values, and then starts services.
#
# SAFETY:
#   - Requires Docker to be running (aborts otherwise).
#   - Verifies this is a Docker-mode Bioloop project before proceeding.
#   - Never kills processes to free ports.
#
# USAGE:
#   bin/deploy_containerized.sh           # start services, preserve existing state
#   bin/deploy_containerized.sh --fresh   # reset environment, then start services
#   bin/deploy_containerized.sh -f        # shorthand for --fresh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/containerized_common.sh"
source "${SCRIPT_DIR}/lib/containerized_ports.sh"

# ── args ──────────────────────────────────────────────────────────────────────

FRESH=false
[[ "${1:-}" == "--fresh" || "${1:-}" == "-f" ]] && FRESH=true

# ── guards ────────────────────────────────────────────────────────────────────

init_repo_context "${BASH_SOURCE[0]}"
cd "${REPO_ROOT}"

COMPOSE_FILE="${REPO_ROOT}/docker-compose.yml"
ensure_compose_file_exists "${COMPOSE_FILE}"

# Read the compose project name dynamically so this script stays in sync with
# docker-compose.yml without requiring manual updates.
COMPOSE_PROJECT="$(read_compose_project_from_file "${COMPOSE_FILE}")"
if [[ -z "${COMPOSE_PROJECT}" ]]; then
  abort "docker-compose.yml does not declare a 'name:' field. Wrong repo or wrong branch?"
fi

# Confirm this is a containerized project before doing anything.
ensure_compose_has_container_app_env "${COMPOSE_FILE}"
ensure_docker_running

# ── port availability + rewrites (always) ────────────────────────────────────
#
# We proactively ensure host-published ports are free before startup.
# If a default host port is occupied, we select the next free host port and
# rewrite compose + dependent app/test config so the stack remains usable.
# This runs whether or not --fresh is passed.
assign_ports_for_stack "main"
apply_stack_port_rewrites \
  "main" \
  "${COMPOSE_FILE}" \
  "${REPO_ROOT}" \
  "${UI_PORT}" \
  "${POSTGRES_PORT}" \
  "${RABBITMQ_MGMT_PORT}" \
  "${MONGO_PORT}" \
  "${DOCS_PORT}" \
  "${JUPYTER_PORT}" \
  "${GRAFANA_PORT}" \
  "${SECURE_DOWNLOAD_PORT}"

# ── optional reset ────────────────────────────────────────────────────────────

if $FRESH; then
  info "--fresh: resetting Docker environment before startup..."
  echo ""
  bash "${SCRIPT_DIR}/reset_containerized.sh" --reset-all
  echo ""
  # Ensure the seed marker is gone even if reset_containerized.sh exited early
  # (e.g. interactive mode with DB step skipped, or a partial failure).
  # The API entrypoint gates on this file — without removing it, the DB
  # would not be re-seeded on the next startup despite a fresh DB.
  rm -f "${REPO_ROOT}/api/.db_seeded"
fi

# ── start services ────────────────────────────────────────────────────────────

info "Starting all services (detached)..."
docker compose up -d

echo ""
success "Services started."
echo ""
info "Check status:    docker compose ps"
info "Follow logs:     docker compose logs -f"
echo ""
info "On a first startup (or after --fresh), allow 1-2 minutes for key and"
info "credential generation, npm installs, and database migrations to complete."
echo ""

print_ui_url_banner "${UI_PORT}"
print_port_changes_banner "${PORT_CHANGES[@]}"
