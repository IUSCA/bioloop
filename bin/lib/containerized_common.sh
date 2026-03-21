#!/bin/bash

RED='\033[0;31m'
YEL='\033[1;33m'
GRN='\033[0;32m'
DIM='\033[2m'
NC='\033[0m'

info()    { echo -e "${DIM}[info]${NC}  $*"; }
warn()    { echo -e "${YEL}[warn]${NC}  $*"; }
success() { echo -e "${GRN}[ok]${NC}    $*"; }
abort()   { echo -e "${RED}[abort]${NC} $*"; exit 1; }

command_exists() {
  command -v "$1" > /dev/null 2>&1
}

init_repo_context() {
  local source_file="$1"
  SCRIPT_DIR="$(cd "$(dirname "${source_file}")" && pwd)"
  REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
}

ensure_docker_running() {
  if ! docker info > /dev/null 2>&1; then
    abort "Docker is not running or not accessible. Start Docker Desktop and try again."
  fi
}

ensure_python_available() {
  if command_exists python3; then
    PYTHON_BIN="python3"
    return 0
  fi
  if command_exists python; then
    PYTHON_BIN="python"
    return 0
  fi
  abort "Python is required for safe port probing (install python3 or python)."
}

ensure_compose_file_exists() {
  local compose_file="$1"
  [[ -f "${compose_file}" ]] || abort "$(basename "${compose_file}") not found at ${REPO_ROOT}."
}

read_compose_project_from_file() {
  local compose_file="$1"
  awk '/^name:/{print $2; exit}' "${compose_file}"
}

ensure_compose_has_container_app_env() {
  local compose_file="$1"
  if ! grep -Eq 'APP_ENV=(docker|ci)' "${compose_file}"; then
    abort "APP_ENV=docker or APP_ENV=ci not found in $(basename "${compose_file}")."
  fi
}

setup_prompt_mode() {
  local first_arg="${1:-}"
  SKIP_PROMPTS=false
  [[ "${first_arg}" == "--reset-all" || "${first_arg}" == "-a" ]] && SKIP_PROMPTS=true
}

confirm() {
  if [[ "${SKIP_PROMPTS:-false}" == "true" ]]; then
    return 0
  fi
  echo ""
  read -rp "  $1  [y/N] " ans
  [[ "$(echo "${ans}" | tr '[:upper:]' '[:lower:]')" == "y" ]]
}

remove_db_dir_with_alpine() {
  local full_path="$1"
  local parent_dir child_dir
  parent_dir="$(dirname "${full_path}")"
  child_dir="$(basename "${full_path}")"
  docker run --rm -v "$(pwd)/${parent_dir}:/mnt" alpine rm -rf "/mnt/${child_dir}"
}

list_project_volumes() {
  local compose_project="$1"
  docker volume ls --filter "label=com.docker.compose.project=${compose_project}" --quiet
}

print_ui_url_banner() {
  local ui_port="$1"
  local ui_url="https://localhost:${ui_port}"
  echo -e "${GRN}╔══════════════════════════════════ OPEN BIOLOOP UI ════════════════════════════════════╗${NC}"
  echo -e "${GRN}║${NC} ${ui_url}"
  echo -e "${GRN}╚═════════════════════════════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

print_port_changes_banner() {
  local -a changes=("$@")
  if [[ ${#changes[@]} -eq 0 ]]; then
    return 0
  fi

  echo -e "${YEL}╔════════════════════════════════ PORT OVERRIDES APPLIED ═══════════════════════════════╗${NC}"
  echo -e "${YEL}║ One or more default host ports were already in use.                                  ║${NC}"
  echo -e "${YEL}║ The script selected free ports and rewrote compose/app/test config accordingly.      ║${NC}"
  echo -e "${YEL}╠═══════════════════════════════════════════════════════════════════════════════════════╣${NC}"
  local change service from_port to_port owner
  for change in "${changes[@]}"; do
    IFS='|' read -r service from_port to_port owner <<< "${change}"
    echo -e "${YEL}║${NC} ${service}: ${from_port} -> ${to_port} (occupied by ${owner})"
  done
  echo -e "${YEL}╠═══════════════════════════════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${YEL}║ Reminder: these are local port rewrites. Review port-related file changes before     ║${NC}"
  echo -e "${YEL}║ committing; you may want to avoid committing machine-specific port overrides.         ║${NC}"
  echo -e "${YEL}╚═══════════════════════════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}
