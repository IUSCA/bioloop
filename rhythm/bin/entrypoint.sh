#!/bin/bash

set -e

# Always run from the app root so relative paths map to the mounted volumes
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

echo "Starting Rhythm API..."

# Check if .env file exists in api directory
if [ -f "$api_env" ]; then
  echo ".env file exists in api directory."
else
  echo "Creating .env file in api directory..."
  touch "$api_env"
fi

KEYS_GENERATED=false
if [ -f "keys/auth.key" ] && [ -f "keys/auth.pub" ]; then
  echo "Keys already exist. Skipping key generation."
else
  echo "Keys not found. Generating new keys..."
  cd keys/
  ./genkeys.sh
  cd ../
  KEYS_GENERATED=true
fi

# The token and signing keys must always be in sync.
# If keys were just regenerated, any existing token was signed with the old
# keys and is now invalid — it must be cleared and reissued.
api_token="WORKFLOW_AUTH_TOKEN"
echo "Checking WORKFLOW_AUTH_TOKEN in '$api_env'..."

if [ "$KEYS_GENERATED" = "false" ] && grep -q "^${api_token}=" "$api_env"; then
  value=$(grep "^${api_token}=" "$api_env" | cut -d'=' -f2)
  if [ -n "$value" ]; then
    echo "Keys and token already exist and are in sync. Skipping token generation."
  else
    echo "Token entry exists but has no value. Regenerating token."
    grep -v "^WORKFLOW_AUTH_TOKEN" "$api_env" > /tmp/_env_tmp && cat /tmp/_env_tmp > "$api_env" && rm /tmp/_env_tmp
    echo "WORKFLOW_AUTH_TOKEN=$(python -m rhythm_api.scripts.issue_token --sub bioloop-dev.sca.iu.edu)" >> "$api_env"
    echo "Created new API token."
    echo "INFO: Restart the API container to pick up the new token."
  fi
else
  if [ "$KEYS_GENERATED" = "true" ]; then
    echo "Keys were regenerated. Clearing stale token and issuing a new one."
  else
    echo "Token not found. Generating new token."
  fi
  grep -v "^WORKFLOW_AUTH_TOKEN" "$api_env" > /tmp/_env_tmp && cat /tmp/_env_tmp > "$api_env" && rm /tmp/_env_tmp
  echo "WORKFLOW_AUTH_TOKEN=$(python -m rhythm_api.scripts.issue_token --sub bioloop-dev.sca.iu.edu)" >> "$api_env"
  echo "Created new API token."
  echo "INFO: Restart the API container to pick up the new token."
fi

$*
