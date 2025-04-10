#!/bin/bash
# This script is used to run the development server for the API.
# It will set up the environment variables and start the server.
set -e


echo "Checking if the database needs seeding..."
if ! npx prisma db seed --preview-feature --dry-run | grep -q "No seeders found"; then
  echo "Database needs seeding. Running the seed command..."
  npx prisma db seed
else
  echo "Database is already seeded or no seeders are available."
fi

echo "Checking if the required environment variables are set..."

# Check if the required environment variable is set
if [ -z "${OAUTH_DOWNLOAD_CLIENT_ID}" ] || [ -z "${OAUTH_DOWNLOAD_CLIENT_SECRET}" ] || [ -z "${OAUTH_UPLOAD_CLIENT_ID}" ] || [ -z "${OAUTH_UPLOAD_CLIENT_SECRET}" ]; then
  echo "Error: One or more required environment variables (ENV_VAR_1, ENV_VAR_2, ENV_VAR_3) are not set. Please set them before running the script."
  
  curl --silent --request POST \
    --url http://signet:5050/create_client \
    --header 'Content-Type: application/x-www-form-urlencoded' \
    --data client_name=$APP_download \
    --data scope=download_file\ upload_file \
    --data client_uri=$APP_DOMAIN \
    --data token_endpoint_auth_method=client_secret_basic \
    --data grant_type=client_credentials

  client_id=$(echo $response | grep -oE '"client_id"\s*:\s*"\K[^"]+')
  client_secret=$(echo $response | grep -oE '"client_secret"\s*:\s*"\K[^"]+')

  sed -i '/^OAUTH_DOWNLOAD_CLIENT_ID/d' api/.env
  echo "OAUTH_DOWNLOAD_CLIENT_ID=$client_id" >> api/.env
  export OAUTH_DOWNLOAD_CLIENT_ID=$client_id

  sed -i '/^OAUTH_DOWNLOAD_CLIENT_SECRET/d' api/.env
  echo "OAUTH_DOWNLOAD_CLIENT_SECRET=$client_secret" >> api/.env
  export OAUTH_DOWNLOAD_CLIENT_SECRET=$client_secret

  sed -i '/^OAUTH_UPLOAD_CLIENT_ID/d' api/.env
  echo "OAUTH_UPLOAD_CLIENT_ID=$client_id" >> api/.env
  export OAUTH_UPLOAD_CLIENT_ID=$client_id
  
  sed -i '/^OAUTH_UPLOAD_CLIENT_SECRET/d' api/.env
  echo "OAUTH_UPLOAD_CLIENT_SECRET=$client_secret" >> api/.env
  export OAUTH_UPLOAD_CLIENT_SECRET=$client_secret
fi

# Check if a specific string exists in a file and has anything following it
workers_env="../workers/.env"
if [ ! -f "$workers_env" ]; then
  echo "The file $workers_env does not exist."
  touch $workers_env
fi

# Start the development server
npm run dev

worker_token="APP_API_TOKEN"
echo "Checking if the string '${worker_token}' exists in the file '$workers_env'..."
if grep -q "^${worker_token}=" "$workers_env"; then
  value=$(grep "^${worker_token}=" "$workers_env" | cut -d'=' -f2)
  if [ -n "$value" ]; then
    echo "The file contains the string '${worker_token}' with a value: $value"
  else
    echo "The string '${worker_token}' exists but has no value."
    sed -i '/^APP_API_TOKEN/d' $workers_env
    echo "APP_API_TOKEN=$(node src/scripts/issue_token.js svc_tasks)" >> $workers_env
  fi
else
  echo "The string '${worker_token}' does not exist in the file."
  echo "APP_API_TOKEN=$(node src/scripts/issue_token.js svc_tasks)" >> $workers_env
fi

