#!/bin/bash
#
# run_containerized_e2e.sh
#
# Runs Playwright tests in the E2E runner container and guarantees
# cleanup of only the test runner service/container when done.
#
# USAGE:
#   bin/run_containerized_e2e.sh
#   bin/run_containerized_e2e.sh -- --project=admin_notifications
#   bin/run_containerized_e2e.sh -- --grep "notifications"
#
# Role matrix mode:
#   bin/run_containerized_e2e.sh --matrix-roles admin,operator,user -- --project=admin_import
#   bin/run_containerized_e2e.sh --matrix-roles admin,user --include-unauthenticated -- --grep "notifications"

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

print_help() {
  cat <<'EOF'
Run E2E tests in the containerized Playwright runner.

Usage:
  bin/run_containerized_e2e.sh [options] [-- <playwright args>]

Options:
  --matrix-roles <csv>       Run once per role (e.g. admin,operator,user).
                             Each run sets E2E_TARGET_ROLES=<role>.
                             By default matrix runs also set E2E_SKIP_UNAUTHENTICATED=1.
  --include-unauthenticated  In matrix mode, do not force E2E_SKIP_UNAUTHENTICATED=1.
  -h, --help                 Show this help.

Examples:
  bin/run_containerized_e2e.sh
  bin/run_containerized_e2e.sh -- --project=admin_notifications
  bin/run_containerized_e2e.sh --matrix-roles admin,operator,user -- --grep "import"
EOF
}

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

if ! docker info > /dev/null 2>&1; then
  abort "Docker is not running or not accessible. Start Docker Desktop and try again."
fi

cleanup_runner() {
  # Clean only the e2e test-runner service artifacts.
  docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" stop e2e > /dev/null 2>&1 || true
  docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" rm -f -s e2e > /dev/null 2>&1 || true
}
trap cleanup_runner EXIT

# The e2e runner container cannot use "localhost" for UI/API on the host.
# Rewrite configured test URLs to host.docker.internal for container reachability.
TEST_BASE_URL_HOST="$(awk -F= '/^TEST_BASE_URL=/{print $2; exit}' "${REPO_ROOT}/tests/.env.default")"
TEST_API_BASE_URL_HOST="$(awk -F= '/^TEST_API_BASE_URL=/{print $2; exit}' "${REPO_ROOT}/tests/.env.default")"
TEST_BASE_URL_CONTAINER="${TEST_BASE_URL_HOST/localhost/host.docker.internal}"
TEST_API_BASE_URL_CONTAINER="${TEST_API_BASE_URL_HOST/localhost/host.docker.internal}"

MATRIX_ROLES=""
MATRIX_INCLUDE_UNAUTH="0"
FORWARDED_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --matrix-roles)
      [[ -n "${2:-}" ]] || abort "--matrix-roles requires a comma-separated value."
      MATRIX_ROLES="$2"
      shift 2
      ;;
    --include-unauthenticated)
      MATRIX_INCLUDE_UNAUTH="1"
      shift
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    --)
      shift
      FORWARDED_ARGS=("$@")
      break
      ;;
    *)
      abort "Unknown argument: $1. Use --help for usage."
      ;;
  esac
done

run_e2e_once() {
  local target_role="${1:-}"
  local include_unauth="${2:-0}"
  local -a cmd=(
    docker compose
    -p "${COMPOSE_PROJECT}"
    -f "${COMPOSE_FILE}"
    --profile e2e-runner
    run --rm
    -e "TEST_BASE_URL=${TEST_BASE_URL_CONTAINER}"
    -e "TEST_API_BASE_URL=${TEST_API_BASE_URL_CONTAINER}"
    -e "PLAYWRIGHT_HTML_OPEN=never"
  )

  if [[ -n "${target_role}" ]]; then
    cmd+=(-e "E2E_TARGET_ROLES=${target_role}")
    if [[ "${include_unauth}" != "1" ]]; then
      cmd+=(-e "E2E_SKIP_UNAUTHENTICATED=1")
    fi
  fi

  cmd+=(e2e test --reporter=line)
  if [[ ${#FORWARDED_ARGS[@]} -gt 0 ]]; then
    cmd+=("${FORWARDED_ARGS[@]}")
  fi

  set +e
  "${cmd[@]}"
  local status=$?
  set -e
  return "${status}"
}

if [[ -z "${MATRIX_ROLES}" ]]; then
  info "Running tests in e2e service (single run, auto-removing runner container)..."
  run_e2e_once "" "0"
  success "E2E test run complete; e2e runner service cleaned up."
  exit 0
fi

IFS=',' read -r -a role_list <<< "${MATRIX_ROLES}"
if [[ ${#role_list[@]} -eq 0 ]]; then
  abort "No roles parsed from --matrix-roles=${MATRIX_ROLES}."
fi

declare -a normalized_roles=()
for role in "${role_list[@]}"; do
  trimmed="$(echo "${role}" | xargs)"
  case "${trimmed}" in
    admin|operator|user)
      normalized_roles+=("${trimmed}")
      ;;
    *)
      abort "Invalid role in --matrix-roles: '${trimmed}'. Allowed: admin,operator,user."
      ;;
  esac
done

declare -a failed_roles=()
run_index=1
total_runs=${#normalized_roles[@]}

warn "Role matrix mode enabled: ${normalized_roles[*]}"
if [[ "${MATRIX_INCLUDE_UNAUTH}" != "1" ]]; then
  info "Matrix runs will set E2E_SKIP_UNAUTHENTICATED=1."
else
  info "Matrix runs will include unauthenticated projects."
fi

for role in "${normalized_roles[@]}"; do
  info "[$run_index/$total_runs] Running role '${role}'..."
  if run_e2e_once "${role}" "${MATRIX_INCLUDE_UNAUTH}"; then
    success "Role '${role}' completed."
  else
    warn "Role '${role}' failed."
    failed_roles+=("${role}")
  fi
  run_index=$((run_index + 1))
done

if [[ ${#failed_roles[@]} -gt 0 ]]; then
  abort "Role-matrix run failed for role(s): ${failed_roles[*]}"
fi

success "Role-matrix E2E runs complete; e2e runner service cleaned up."
#!/bin/bash
#
# run_containerized_e2e.sh
#
# Runs Playwright tests in the E2E runner container and guarantees
# cleanup of only the test runner service/container when done.
#
# USAGE:
#   bin/run_containerized_e2e.sh
#   bin/run_containerized_e2e.sh -- --project=admin_notifications
#   bin/run_containerized_e2e.sh -- --grep "notifications"

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
cd "${REPO_ROOT}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  abort "docker-compose-e2e.yml not found at ${REPO_ROOT}."
fi

COMPOSE_PROJECT=$(awk '/^name:/{print $2; exit}' "${COMPOSE_FILE}")
if [[ -z "${COMPOSE_PROJECT}" ]]; then
  abort "docker-compose-e2e.yml does not declare a 'name:' field."
fi

if ! docker info > /dev/null 2>&1; then
  abort "Docker is not running or not accessible. Start Docker Desktop and try again."
fi

cleanup_runner() {
  # Clean only the e2e test-runner service artifacts.
  docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" stop e2e > /dev/null 2>&1 || true
  docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" rm -f -s e2e > /dev/null 2>&1 || true
}
trap cleanup_runner EXIT

# The e2e runner container cannot use "localhost" for UI/API on the host.
# Rewrite configured test URLs to host.docker.internal for container reachability.
TEST_BASE_URL_HOST="$(awk -F= '/^TEST_BASE_URL=/{print $2; exit}' "${REPO_ROOT}/tests/.env.default")"
TEST_API_BASE_URL_HOST="$(awk -F= '/^TEST_API_BASE_URL=/{print $2; exit}' "${REPO_ROOT}/tests/.env.default")"
TEST_BASE_URL_CONTAINER="${TEST_BASE_URL_HOST/localhost/host.docker.internal}"
TEST_API_BASE_URL_CONTAINER="${TEST_API_BASE_URL_HOST/localhost/host.docker.internal}"

# Optional delimiter: everything after "--" is forwarded to Playwright.
FORWARDED_ARGS=()
if [[ "${1:-}" == "--" ]]; then
  shift
  FORWARDED_ARGS=("$@")
fi

info "Running tests in e2e service (auto-removing runner container)..."
if [[ ${#FORWARDED_ARGS[@]} -eq 0 ]]; then
  docker compose \
    -p "${COMPOSE_PROJECT}" \
    -f "${COMPOSE_FILE}" \
    --profile e2e-runner \
    run --rm \
    -e TEST_BASE_URL="${TEST_BASE_URL_CONTAINER}" \
    -e TEST_API_BASE_URL="${TEST_API_BASE_URL_CONTAINER}" \
    -e PLAYWRIGHT_HTML_OPEN="never" \
    e2e test --reporter=line
else
  docker compose \
    -p "${COMPOSE_PROJECT}" \
    -f "${COMPOSE_FILE}" \
    --profile e2e-runner \
    run --rm \
    -e TEST_BASE_URL="${TEST_BASE_URL_CONTAINER}" \
    -e TEST_API_BASE_URL="${TEST_API_BASE_URL_CONTAINER}" \
    -e PLAYWRIGHT_HTML_OPEN="never" \
    e2e test --reporter=line "${FORWARDED_ARGS[@]}"
fi

success "E2E test run complete; e2e runner service cleaned up."
