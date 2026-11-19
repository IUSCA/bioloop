#!/usr/bin/env bash

# Read dotenv values as data, not shell code. Node 24 is available before npm install.
load_runtime_env() {
  local compose_node_env="${1:-}"
  local runtime_env_path="${2:-.env}"
  local runtime_env_entry
  local runtime_env_loaded=false

  if [[ -f "$runtime_env_path" ]]; then
    while IFS= read -r -d '' runtime_env_entry; do
      if [[ -z "$runtime_env_entry" ]]; then
        runtime_env_loaded=true
        break
      fi
      export "$runtime_env_entry" || return 1
    done < <(
      node - "$runtime_env_path" <<'NODE'
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const entries = Object.entries(parseEnv(readFileSync(process.argv[2], 'utf8')));
if (entries.some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || value.includes('\0'))) {
  throw new Error('The runtime .env contains an invalid environment variable.');
}
for (const [key, value] of entries) process.stdout.write(`${key}=${value}\0`);
NODE
      # An empty NUL-delimited record signals success, including an empty file.
      # Without it, a process-substitution failure could be silently ignored.
      if [[ $? -eq 0 ]]; then
        printf '\0'
      fi
    )

    if [[ "$runtime_env_loaded" != true ]]; then
      echo "Failed to load the runtime environment." >&2
      return 1
    fi
  fi

  if [[ -n "$compose_node_env" ]]; then
    export NODE_ENV="$compose_node_env"
  fi
}
