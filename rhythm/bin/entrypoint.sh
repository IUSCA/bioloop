#!/bin/bash

set -e

if [ -f "keys/auth.key" ] && [ -f "keys/auth.pub" ]; then 
  echo "Keys already exist. Skipping key generation."
else
  cd keys/
  ./genkeys.sh
  cd ../
fi

# Check if a specific string exists in a file and has anything following it
api_env="api/.env"
if [ ! -f "$api_env" ]; then
  echo "The file $api_env does not exist."
  exit 1
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
    sed -i '/^WORKFLOW_AUTH_TOKEN/d' $api_env
    echo "WORKFLOW_AUTH_TOKEN=$(python -m rhythm_api.scripts.issue_token --sub bioloop-dev.sca.iu.edu)" >> $api_env
  fi
else
  echo "The string '${api_token}' does not exist in the file."
  echo "WORKFLOW_AUTH_TOKEN=$(python -m rhythm_api.scripts.issue_token --sub bioloop-dev.sca.iu.edu)" >> $api_env
fi

$*