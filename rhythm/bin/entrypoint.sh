#!/bin/bash

set -e

_START_TIME=$(date +%s)
ts() { printf "[%s +%ds] " "$(date '+%H:%M:%S')" "$(( $(date +%s) - _START_TIME ))"; }

ts; echo "=== Rhythm entrypoint start ==="

APP_ROOT="/app"
if [ -d "$APP_ROOT" ]; then
  cd "$APP_ROOT"
fi

API_DIR="${APP_ROOT}/api"
if [ ! -d "$API_DIR" ]; then
  echo "ERROR: Expected API directory at $API_DIR not found."
  exit 1
fi

api_env="${API_DIR}/.env"

if [ -f "$api_env" ]; then
  ts; echo "api/.env exists."
else
  ts; echo "Creating api/.env..."
  touch "$api_env"
fi

KEYS_GENERATED=false
if [ -f "keys/auth.key" ] && [ -f "keys/auth.pub" ]; then
  ts; echo "RSA keys already exist. Skipping generation."
else
  ts; echo "Generating RSA keys..."
  _T=$(date +%s)
  cd keys/
  ./genkeys.sh
  cd ../
  KEYS_GENERATED=true
  ts; echo "RSA key generation done ($(( $(date +%s) - _T ))s)"
fi

api_token="WORKFLOW_AUTH_TOKEN"
ts; echo "Checking WORKFLOW_AUTH_TOKEN in '$api_env'..."

if [ "$KEYS_GENERATED" = "false" ] && grep -q "^${api_token}=" "$api_env"; then
  value=$(grep "^${api_token}=" "$api_env" | cut -d'=' -f2)
  if [ -n "$value" ]; then
    ts; echo "Keys and token already exist and are in sync. Skipping token generation."
  else
    ts; echo "Token entry exists but has no value. Regenerating token..."
    _T=$(date +%s)
    grep -v "^WORKFLOW_AUTH_TOKEN" "$api_env" > /tmp/_env_tmp && cat /tmp/_env_tmp > "$api_env" && rm /tmp/_env_tmp
    echo "WORKFLOW_AUTH_TOKEN=$(python -m rhythm_api.scripts.issue_token --sub bioloop-dev.sca.iu.edu)" >> "$api_env"
    ts; echo "Token regenerated ($(( $(date +%s) - _T ))s). Restart API to pick it up."
  fi
else
  if [ "$KEYS_GENERATED" = "true" ]; then
    ts; echo "Keys were just generated — clearing stale token and issuing a new one..."
  else
    ts; echo "Token not found. Generating..."
  fi
  _T=$(date +%s)
  grep -v "^WORKFLOW_AUTH_TOKEN" "$api_env" > /tmp/_env_tmp && cat /tmp/_env_tmp > "$api_env" && rm /tmp/_env_tmp
  echo "WORKFLOW_AUTH_TOKEN=$(python -m rhythm_api.scripts.issue_token --sub bioloop-dev.sca.iu.edu)" >> "$api_env"
  ts; echo "Token generated ($(( $(date +%s) - _T ))s). Restart API to pick it up."
fi

ts; echo "=== Rhythm entrypoint complete — total $(( $(date +%s) - _START_TIME ))s ==="
$*
