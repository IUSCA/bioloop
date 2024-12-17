#!/bin/bash

# Possible values for environment_scope are:
# - "*"
# - "production"
# - "testing"
environment_scope="*"

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

  echo "Creating variable $key=$value ..."

curl --request POST --header "PRIVATE-TOKEN: $GITLAB_TOKEN" "https://git.sca.iu.edu/api/v4/projects/$PROJECT_ID/variables" --form "key=$key" --form "value=$value" --form "environment_scope=$environment_scope"
}

echo "Getting API environment variables from api/.env.example file ..."
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
  create_variable "$key" "${env_vars[$key]}"
done

echo "Getting UI environment variables from ui/.env.example file ..."
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
  create_variable "$key" "${env_vars[$key]}"
done

echo "Getting tests environment variables from tests/.env.example file ..."
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
  create_variable "$key" "${env_vars[$key]}"
done

echo "Getting db environment variables from db/.env.example file ..."
# Read environment variables from .env file into an array
declare -A env_vars
while IFS='=' read -r key value; do
  if [[ $key != \#* ]]; then
    env_vars["$key"]="$value"
  fi
done < "db/postgres/.env.example"

# Print the environment variables
for key in "${!env_vars[@]}"; do
  echo "Creating key $key=${env_vars[$key]} ..."
  create_variable "$key" "${env_vars[$key]}"
done