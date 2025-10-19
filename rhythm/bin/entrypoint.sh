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

if [ -f "keys/auth.key" ] && [ -f "keys/auth.pub" ]; then 
  echo "Keys already exist. Skipping key generation."
else
  cd keys/
  ./genkeys.sh
  cd ../
fi

# Check if the string exists in the file
api_token="WORKFLOW_AUTH_TOKEN"
echo "Checking if the string '${api_token}' exists in the file '$api_env'..."
if grep -q "^${api_token}=" "$api_env"; then
  value=$(grep "^${api_token}=" "$api_env" | cut -d'=' -f2)
  if [ -n "$value" ]; then
    echo "The file contains the string '${api_token}' with a value: $value"
  else
    echo "The string '${api_token}' exists but has no value."
    sed -i '/^WORKFLOW_AUTH_TOKEN/d' "$api_env"
    echo "WORKFLOW_AUTH_TOKEN=$(python -m rhythm_api.scripts.issue_token --sub bioloop-dev.sca.iu.edu)" >> "$api_env"
    echo "Created new API token."
    echo "INFO: You MUST RESTART THE API in order to use the new token."
  fi
else
  echo "The string '${api_token}' does not exist in the file."
  echo "WORKFLOW_AUTH_TOKEN=$(python -m rhythm_api.scripts.issue_token --sub bioloop-dev.sca.iu.edu)" >> "$api_env"
  echo "Created new API token."
  echo "INFO: You MUST RESTART THE API in order to use the new token."
fi

$*
