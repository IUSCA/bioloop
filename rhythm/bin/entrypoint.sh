#!/bin/bash

set -e

api_env="api/.env"

# Check if .env file exists in api directory
if [ -f "$api_env" ]; then
  echo ".env file exists in api directory."
else
  echo "Creating .env file in api directory..."
  touch $api_env
fi


if [ -f "keys/auth.key" ] && [ -f "keys/auth.pub" ]; then 
  echo "Keys already exist. Skipping key generation."
else
  cd keys/
  ./genkeys.sh
  cd ../
fi



# Always overwrite WORKFLOW_AUTH_TOKEN if .env exists
api_token="WORKFLOW_AUTH_TOKEN"
echo "Checking if the string '${api_token}' exists in the file '$api_env'..."
if grep -q "^${api_token}=" "$api_env"; then
  echo "The string '${api_token}' exists. Overwriting with new token..."
  # Use grep -v to exclude the line and write to temp file, then move
  grep -v "^${api_token}=" "$api_env" > "${api_env}.tmp" && mv "${api_env}.tmp" "$api_env"
else
  echo "The string '${api_token}' does not exist in the file."
fi
echo "WORKFLOW_AUTH_TOKEN=$(python -m rhythm_api.scripts.issue_token --sub bioloop-dev.sca.iu.edu)" >> $api_env
echo "WORKFLOW_AUTH_TOKEN has been set/updated in $api_env"

$*