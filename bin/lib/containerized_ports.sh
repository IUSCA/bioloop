#!/bin/bash

PORT_CHANGES=()
RESERVED_PORTS_LIST=""

port_owner_from_lsof() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $1 " (pid " $2 ")"; exit}'
}

port_owner_from_ss() {
  local port="$1"
  ss -ltnp "sport = :${port}" 2>/dev/null | awk '
    /users:\(\(/ {
      match($0, /users:\(\("([^"]+)",pid=([0-9]+)/, m)
      if (m[1] != "" && m[2] != "") {
        print m[1] " (pid " m[2] ")"
        exit
      }
    }'
}

port_owner_from_netstat() {
  local port="$1"
  netstat -lntp 2>/dev/null | awk -v p=":${port}" '
    $4 ~ p"$" {
      split($7, a, "/")
      if (a[1] ~ /^[0-9]+$/ && a[2] != "") {
        print a[2] " (pid " a[1] ")"
        exit
      }
    }'
}

is_port_free() {
  local port="$1"
  "${PYTHON_BIN}" - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    sock.bind(("127.0.0.1", port))
except OSError:
    sys.exit(1)
finally:
    sock.close()
sys.exit(0)
PY
}

port_owner() {
  local port="$1"
  local owner=""
  if command_exists lsof; then
    owner="$(port_owner_from_lsof "${port}")"
  elif command_exists ss; then
    owner="$(port_owner_from_ss "${port}")"
  elif command_exists netstat; then
    owner="$(port_owner_from_netstat "${port}")"
  fi
  [[ -n "${owner}" ]] && echo "${owner}" || echo "unknown process"
}

is_reserved_port() {
  local port="$1"
  case " ${RESERVED_PORTS_LIST} " in
    *" ${port} "*) return 0 ;;
    *) return 1 ;;
  esac
}

reserve_port() {
  local port="$1"
  RESERVED_PORTS_LIST="${RESERVED_PORTS_LIST} ${port}"
}

find_free_port() {
  local start_port="$1"
  local candidate
  for ((candidate=start_port; candidate<=65535; candidate++)); do
    if is_reserved_port "${candidate}"; then
      continue
    fi
    if is_port_free "${candidate}"; then
      echo "${candidate}"
      return 0
    fi
  done
  return 1
}

select_port() {
  local service_name="$1"
  local default_port="$2"
  local var_name="$3"
  local selected_port owner

  if is_port_free "${default_port}" && ! is_reserved_port "${default_port}"; then
    selected_port="${default_port}"
  else
    owner="$(port_owner "${default_port}")"
    selected_port="$(find_free_port "$((default_port + 1))")" || abort "No free host port found for ${service_name} (default ${default_port})."
    PORT_CHANGES+=("${service_name}|${default_port}|${selected_port}|${owner}")
    warn "${service_name}: host port ${default_port} is busy (${owner}); using ${selected_port}."
  fi

  reserve_port "${selected_port}"
  printf -v "${var_name}" '%s' "${selected_port}"
}

assign_ports_for_stack() {
  local stack="$1"
  ensure_python_available
  select_port "ui (https)" 443 UI_PORT
  select_port "postgres (host access)" 5433 POSTGRES_PORT
  select_port "rabbitmq management" 15672 RABBITMQ_MGMT_PORT
  select_port "mongo (host access)" 27017 MONGO_PORT
  select_port "docs (vitepress)" 5173 DOCS_PORT
  select_port "jupyter_ijs" 8888 JUPYTER_PORT
  select_port "grafana" 3000 GRAFANA_PORT
  if [[ "${stack}" == "main" ]]; then
    select_port "secure_download" 3060 SECURE_DOWNLOAD_PORT
  else
    SECURE_DOWNLOAD_PORT=""
  fi
}

apply_stack_port_rewrites() {
  local stack="$1"
  local compose_file="$2"
  local repo_root="$3"
  local ui_port="$4"
  local postgres_port="$5"
  local rabbitmq_mgmt_port="$6"
  local mongo_port="$7"
  local docs_port="$8"
  local jupyter_port="$9"
  local grafana_port="${10}"
  local secure_download_port="${11:-}"

  python3 - "${stack}" "${compose_file}" "${repo_root}" \
    "${ui_port}" "${postgres_port}" "${rabbitmq_mgmt_port}" "${mongo_port}" \
    "${docs_port}" "${jupyter_port}" "${grafana_port}" "${secure_download_port}" <<'PY'
import re
import sys
from pathlib import Path

stack = sys.argv[1]
compose_file = Path(sys.argv[2])
repo_root = Path(sys.argv[3])
ui_port = sys.argv[4]
postgres_port = sys.argv[5]
rabbitmq_mgmt_port = sys.argv[6]
mongo_port = sys.argv[7]
docs_port = sys.argv[8]
jupyter_port = sys.argv[9]
grafana_port = sys.argv[10]
secure_download_port = sys.argv[11]

def replace_line_pattern(text, pattern, replacement):
    return re.sub(pattern, replacement, text, flags=re.MULTILINE)

compose_text = compose_file.read_text()
compose_text = replace_line_pattern(compose_text, r'^(\s*-\s*)127\.0\.0\.1:\d+:443(\s*(?:#.*)?)$', rf'\g<1>127.0.0.1:{ui_port}:443\g<2>')
compose_text = replace_line_pattern(compose_text, r'^(\s*-\s*)127\.0\.0\.1:\d+:5432(\s*(?:#.*)?)$', rf'\g<1>127.0.0.1:{postgres_port}:5432\g<2>')
compose_text = replace_line_pattern(compose_text, r'^(\s*-\s*)127\.0\.0\.1:\d+:15672(\s*(?:#.*)?)$', rf'\g<1>127.0.0.1:{rabbitmq_mgmt_port}:15672\g<2>')
compose_text = replace_line_pattern(compose_text, r'^(\s*-\s*)127\.0\.0\.1:\d+:27017(\s*(?:#.*)?)$', rf'\g<1>127.0.0.1:{mongo_port}:27017\g<2>')
compose_text = replace_line_pattern(compose_text, r'^(\s*-\s*)127\.0\.0\.1:\d+:5173(\s*(?:#.*)?)$', rf'\g<1>127.0.0.1:{docs_port}:5173\g<2>')
compose_text = replace_line_pattern(compose_text, r'^(\s*-\s*)"?\d+:8888"?(\s*(?:#.*)?)$', rf'\g<1>"{jupyter_port}:8888"\g<2>')
compose_text = replace_line_pattern(compose_text, r'^(\s*-\s*)"?\d+:3000"?(\s*(?:#.*)?)$', rf'\g<1>"{grafana_port}:3000"\g<2>')
if stack == "main" and secure_download_port:
    compose_text = replace_line_pattern(compose_text, r'^(\s*-\s*)"?\d+:3060"?(\s*(?:#.*)?)$', rf'\g<1>"{secure_download_port}:3060"\g<2>')
compose_file.write_text(compose_text)

ui_env_file = repo_root / "ui/.env.default"
ui_env_text = ui_env_file.read_text()
ui_env_text = replace_line_pattern(ui_env_text, r'^VITE_CAS_RETURN=.*$', f'VITE_CAS_RETURN=https://localhost:{ui_port}/auth/iucas')
ui_env_text = replace_line_pattern(ui_env_text, r'^VITE_GOOGLE_RETURN=.*$', f'VITE_GOOGLE_RETURN=https://localhost:{ui_port}/auth/google')
ui_env_text = replace_line_pattern(ui_env_text, r'^VITE_CILOGON_RETURN=.*$', f'VITE_CILOGON_RETURN=https://localhost:{ui_port}/auth/cil')
ui_env_text = replace_line_pattern(ui_env_text, r'^VITE_MICROSOFT_RETURN=.*$', f'VITE_MICROSOFT_RETURN=https://localhost:{ui_port}/auth/microsoft')
if stack == "main" and secure_download_port:
    ui_env_text = replace_line_pattern(ui_env_text, r'^VITE_UPLOAD_API_BASE_PATH=.*$', f'VITE_UPLOAD_API_BASE_PATH=http://localhost:{secure_download_port} # for if it\'s the same host as in dev')
ui_env_file.write_text(ui_env_text)

if stack == "main" and secure_download_port:
    api_env_file = repo_root / "api/.env.default"
    api_env_text = api_env_file.read_text()
    api_env_text = replace_line_pattern(api_env_text, r'^DOWNLOAD_SERVER_BASE_URL=.*$', f'DOWNLOAD_SERVER_BASE_URL=http://localhost:{secure_download_port}')
    api_env_file.write_text(api_env_text)

tests_env_file = repo_root / "tests/.env.default"
tests_env_text = tests_env_file.read_text()
tests_env_text = replace_line_pattern(tests_env_text, r'^TEST_BASE_URL=.*$', f'TEST_BASE_URL=https://localhost:{ui_port}')
tests_env_text = replace_line_pattern(tests_env_text, r'^TEST_API_BASE_URL=.*$', f'TEST_API_BASE_URL=https://localhost:{ui_port}/api')
tests_env_file.write_text(tests_env_text)

tests_config_file = repo_root / "tests/config/default.json"
tests_config_text = tests_config_file.read_text()
tests_config_text = replace_line_pattern(tests_config_text, r'^(\s*)"baseURL":\s*".*?",$', rf'\g<1>"baseURL": "https://localhost:{ui_port}",')
tests_config_text = replace_line_pattern(tests_config_text, r'^(\s*)"apiBaseURL":\s*".*?",$', rf'\g<1>"apiBaseURL": "https://localhost:{ui_port}/api",')
tests_config_file.write_text(tests_config_text)
PY
}
