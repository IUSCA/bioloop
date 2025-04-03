#!/bin/bash
set -e

export APP_UID=1001
export APP_GID=1001

# Download the rhythm_api repository if it doesn't exist
if [ ! -d "rhythm_api" ]; then git clone https://github.com/IUSCA/rhythm_api.git; fi

# Generate keys
if [ -f "rhythm_api/keys/auth.key" ] && [ -f "rhythm_api/keys/auth.pub" ]; then 
  echo "Keys already exist. Skipping key generation."
else
  cd rhythm_api/keys/
  ./genkeys.sh
  cd ../../
fi

# Download the signet repository if it doesn't exist
if [ ! -d "signet" ]; then git clone https://github.com/IUSCA/signet.git; fi

if [ -f "signet/keys/auth.key" ] && [ -f "signet/keys/auth.pub" ]; then 
  echo "Keys already exist. Skipping key generation."
else
  # Generate keys 
  cd signet/keys/
  ./genkeys.sh
  cd ../../
fi

# Create api .env file if it doesn't exist
if [ ! -f "api/.env" ]; then 
  # api will check if all env vars have values
  # prefill the .env file with example values so api can start the first time
  touch api/.env
  echo "OAUTH_DOWNLOAD_CLIENT_ID=example" >> api/.env
  echo "OAUTH_DOWNLOAD_CLIENT_SECRET=example" >> api/.env
  echo "OAUTH_UPLOAD_CLIENT_ID=example" >> api/.env
  echo "OAUTH_UPLOAD_CLIENT_SECRET=example" >> api/.env
  echo "WORKFLOW_AUTH_TOKEN=example" >> api/.env
fi

# Create workers .env file if it doesn't exist
if [ ! -f "workers/.env" ]; then touch workers/.env; fi

# remove any existing containers/networks
docker compose down 
docker compose pull && docker compose up -d --force-recreate --remove-orphans --build


echo "Setting up the database..."
docker compose exec api npx prisma db seed


echo "Getting signet oauth client id and secret..."
APP_DOMAIN="${APP_DOMAIN:-'localhost'}"
APP_download="${APP_DOMAIN%%.*}_download"
response=$(docker compose exec api curl --silent --request POST \
  --url http://signet:5050/create_client \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data client_name=$APP_download \
  --data scope=download_file\ upload_file \
  --data client_uri=$APP_DOMAIN \
  --data token_endpoint_auth_method=client_secret_basic \
  --data grant_type=client_credentials)

client_id=$(echo $response | grep -oP '"client_id"\s*:\s*"\K[^"]+')
client_secret=$(echo $response | grep -oP '"client_secret"\s*:\s*"\K[^"]+')

sed -i '/^OAUTH_DOWNLOAD_CLIENT_ID/d' api/.env
echo "OAUTH_DOWNLOAD_CLIENT_ID=$client_id" >> api/.env

sed -i '/^OAUTH_DOWNLOAD_CLIENT_SECRET/d' api/.env
echo "OAUTH_DOWNLOAD_CLIENT_SECRET=$client_secret" >> api/.env

sed -i '/^OAUTH_UPLOAD_CLIENT_ID/d' api/.env
echo "OAUTH_UPLOAD_CLIENT_ID=$client_id" >> api/.env

sed -i '/^OAUTH_UPLOAD_CLIENT_SECRET/d' api/.env
echo "OAUTH_UPLOAD_CLIENT_SECRET=$client_secret" >> api/.env

# Setup the auth token for the workflow service
echo "Setting up the auth token for the workflow service..."
sed -i '/^WORKFLOW_AUTH_TOKEN/d' api/.env
echo "WORKFLOW_AUTH_TOKEN=$(docker compose exec rhythm python -m rhythm_api.scripts.issue_token --sub bioloop-dev.sca.iu.edu)" >> api/.env

# Setup connection to the api from the workers container
echo "Setting up connection to the api from the workers container..."
sed -i '/^APP_API_TOKEN/d' workers/.env

echo "APP_API_TOKEN=$(docker compose exec api node src/scripts/issue_token.js svc_tasks)" >> workers/.env

# stop the services so that the new environment vars can be loaded
docker compose down

# Start the services
docker compose up -d
