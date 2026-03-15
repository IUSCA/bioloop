#!/bin/bash

set -e

# Rhythm (workflow API) service entrypoint.
#
# Generates RSA signing keys and writes a WORKFLOW_AUTH_TOKEN to api/.env.
# The API container waits for this token before proceeding with its own setup.

echo "=== Rhythm entrypoint start ==="

APP_ROOT="/app"
if [ -d "$APP_ROOT" ]; then
  cd "$APP_ROOT"
fi

# Rhythm mounts the api/ directory so it can write WORKFLOW_AUTH_TOKEN directly
# into api/.env, where the API container reads it during startup.
API_DIR="${APP_ROOT}/api"
if [ ! -d "$API_DIR" ]; then
  echo "ERROR: Expected API directory at $API_DIR not found."
  exit 1
fi

api_env="${API_DIR}/.env"

if [ -f "$api_env" ]; then
  echo "api/.env exists."
else
  echo "Creating api/.env..."
  touch "$api_env"
fi

# RSA key pair used to sign and verify JWTs issued by Rhythm.
# Stored in a named Docker volume so they persist across container restarts.
KEYS_GENERATED=false
if [ -f "keys/auth.key" ] && [ -f "keys/auth.pub" ]; then
  echo "RSA keys already exist. Skipping generation."
else
  echo "Generating RSA keys..."
  cd keys/
  ./genkeys.sh
  cd ../
  KEYS_GENERATED=true
  echo "RSA key generation done."
fi

api_token="WORKFLOW_AUTH_TOKEN"
echo "Checking WORKFLOW_AUTH_TOKEN in '$api_env'..."

# The token and keys must always be in sync: a token signed by old keys is
# invalid and will cause the API to receive 401s from Rhythm.  When new keys
# are generated, any existing token is replaced unconditionally.
#
# grep -v | cat is used instead of sed -i to avoid in-place edit failures
# that occur on some bind mount implementations (e.g. virtiofs on macOS
# Docker Desktop).  This pattern is portable and works on any platform.
if [ "$KEYS_GENERATED" = "false" ] && grep -q "^${api_token}=" "$api_env"; then
  value=$(grep "^${api_token}=" "$api_env" | cut -d'=' -f2)
  if [ -n "$value" ]; then
    echo "Keys and token already exist and are in sync. Skipping token generation."
  else
    echo "Token entry exists but has no value. Regenerating token..."
    grep -v "^WORKFLOW_AUTH_TOKEN" "$api_env" > /tmp/_env_tmp && cat /tmp/_env_tmp > "$api_env" && rm /tmp/_env_tmp
    echo "WORKFLOW_AUTH_TOKEN=$(python -m rhythm_api.scripts.issue_token --sub bioloop-dev.sca.iu.edu)" >> "$api_env"
    echo "Token regenerated. Restart API to pick it up."
  fi
else
  if [ "$KEYS_GENERATED" = "true" ]; then
    echo "Keys were just generated — clearing stale token and issuing a new one..."
  else
    echo "Token not found. Generating..."
  fi
  grep -v "^WORKFLOW_AUTH_TOKEN" "$api_env" > /tmp/_env_tmp && cat /tmp/_env_tmp > "$api_env" && rm /tmp/_env_tmp
  echo "WORKFLOW_AUTH_TOKEN=$(python -m rhythm_api.scripts.issue_token --sub bioloop-dev.sca.iu.edu)" >> "$api_env"
  echo "Token generated. Restart API to pick it up."
fi

echo "=== Rhythm entrypoint complete ==="
$*
