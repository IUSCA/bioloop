#!/bin/bash

# Ensure the script is being executed from the root project directory
if [ "$(dirname "$0")" != "bin" ]; then
  echo "Please run this script from the root project directory"
  echo "Example: bin/setup_ci_env.sh"
  exit 1
fi

# Load environment variables from .env file
if [ -f "bin/.env" ]; then
  export $(grep -v '^#' bin/.env | xargs) > /dev/null
fi

# Check if GITLAB_TOKEN is set
if [ -z "$GITLAB_TOKEN" ]; then
  echo "GITLAB_TOKEN is not set"
  exit 1
else
  echo "GITLAB_TOKEN is set to '$GITLAB_TOKEN'"
fi

# Check if PROJECT_ID is set
if [ -z "$PROJECT_ID" ]; then
  echo "PROJECT_ID is not set"
  exit 1
else
  echo "PROJECT_ID is set to '$PROJECT_ID'"
fi

# API URL
API_URL="https://git.sca.iu.edu/api/v4/projects/$PROJECT_ID/variables"

# Function to create a variable
create_variable() {
  local key=$1
  local value=$2

  curl --request POST "$API_URL" \
    --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
    --header "Content-Type: application/json" \
    --data "{\"key\":\"$key\", \"value\":\"$value\"}"
}

echo "Getting environment variables from api/.env.example file ..."
# Read environment variables from .env file into an array
declare -A env_vars
while IFS='=' read -r key value; do
  if [[ $key != \#* ]]; then
    env_vars["$key"]="$value"
  fi
done < "api/.env.example"

# Print the environment variables
for key in "${!env_vars[@]}"; do
  echo "Creating key $key=${env_vars[$key]} ..."
  create_variable "$key" "${variables[$key]}"
done

echo "Getting environment variables from ui/.env.example file ..."
# Read environment variables from .env file into an array
declare -A env_vars
while IFS='=' read -r key value; do
  if [[ $key != \#* ]]; then
    env_vars["$key"]="$value"
  fi
done < "ui/.env.example"

# Print the environment variables
for key in "${!env_vars[@]}"; do
  echo "Creating key $key=${env_vars[$key]} ..."
  create_variable "$key" "${variables[$key]}"
done

echo "Getting environment variables from tests/.env.example file ..."
# Read environment variables from .env file into an array
declare -A env_vars
while IFS='=' read -r key value; do
  if [[ $key != \#* ]]; then
    env_vars["$key"]="$value"
  fi
done < "tests/.env.example"

# Print the environment variables
for key in "${!env_vars[@]}"; do
  echo "Creating key $key=${env_vars[$key]} ..."
  create_variable "$key" "${variables[$key]}"
done