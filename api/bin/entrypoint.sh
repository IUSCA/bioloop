#!/bin/bash

# check if .env file exists
if [ ! -f "workers/.env" ]; then
  echo "Creating .env file..."
  touch workers/.env
fi

# Check if pre-requisites are installed
while ! grep -q "^WORKFLOW_AUTH_TOKEN=[^ ]\+" ".env"; do
  echo "Waiting for .env file to be ready and contain WORKFLOW_AUTH_TOKEN..."
  sleep 1
done

# Dynamically load environment variables from .env file
# This will export all variables in the .env file to the environment
# This ensure that the script can access the variables we generated during startup
export $(grep -v '^#' .env | xargs)

# Check if keys exists
if [ -f "keys/auth.pub" ] && [ -f "keys/auth.key" ]; then
  echo "Keys already exist. Skipping key generation." 
else
  echo "Keys not found. Generating keys..."
  cd keys 
  openssl genrsa -out auth.key 2048
  chmod 600 auth.key
  openssl rsa -in auth.key -pubout > auth.pub
  cd .. 
fi

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate 

# Run database migrations
npx prisma migrate deploy

echo "Checking if the database needs seeding..."
# if ! npx prisma db seed --preview-feature --dry-run | grep -q "No seeders found"; then
#   echo "Database needs seeding. Running the seed command..."
#   npx prisma db seed
# else
#   echo "Database is already seeded or no seeders are available."
# fi
npx prisma db seed

echo "Checking if the required environment variables are set..."

# Check if the required environment variable is set
if [ "${OAUTH_DOWNLOAD_CLIENT_ID}" = "xxx" ] || [ "${OAUTH_DOWNLOAD_CLIENT_SECRET}" = "xxx" ] || [ "${OAUTH_UPLOAD_CLIENT_ID}" = "xxx" ] || [ "${OAUTH_UPLOAD_CLIENT_SECRET}" = "xxx" ]; then

  echo "One or more required environment variables are set to 'xxx'. Generating new OAuth client credentials..."
  response=$(curl --silent --request POST \
    --url http://signet:9007/create_client \
    --header 'Content-Type: application/x-www-form-urlencoded' \
    --data client_name=localhost_download \
    --data scope=download_file\ upload_file \
    --data client_uri=localhost \
    --data token_endpoint_auth_method=client_secret_basic \
    --data grant_type=client_credentials)

  echo "Response from server: $response"

  # Extract the client_id and client_secret from the response JSON
  client_id=$(echo "$response" | grep -oP '(?<="client_id":")[^"]*')
  client_secret=$(echo "$response" | grep -oP '(?<="client_secret":")[^"]*')


  echo "Client ID: $client_id"
  echo "Client Secret: $client_secret" 

  echo "Updating .env file with new OAuth client credentials..."
  

  sed -i '/^OAUTH_DOWNLOAD_CLIENT_ID/d' .env
  echo "OAUTH_DOWNLOAD_CLIENT_ID=$client_id" >> .env
  export OAUTH_DOWNLOAD_CLIENT_ID=$client_id

  sed -i '/^OAUTH_DOWNLOAD_CLIENT_SECRET/d' .env
  echo "OAUTH_DOWNLOAD_CLIENT_SECRET=$client_secret" >> .env
  export OAUTH_DOWNLOAD_CLIENT_SECRET=$client_secret

  sed -i '/^OAUTH_UPLOAD_CLIENT_ID/d' .env
  echo "OAUTH_UPLOAD_CLIENT_ID=$client_id" >> .env
  export OAUTH_UPLOAD_CLIENT_ID=$client_id
  
  sed -i '/^OAUTH_UPLOAD_CLIENT_SECRET/d' .env
  echo "OAUTH_UPLOAD_CLIENT_SECRET=$client_secret" >> .env
  export OAUTH_UPLOAD_CLIENT_SECRET=$client_secret
fi


if ! grep -q "^APP_API_TOKEN=[^ ]\+" "workers/.env"; then
  echo "APP_API_TOKEN=$(node src/scripts/issue_token.js svc_tasks)"
  echo "APP_API_TOKEN=$(node src/scripts/issue_token.js svc_tasks)" >> workers/.env
fi

# Dynamically load environment variables from .env file
# This will export all variables in the .env file to the environment
# This ensure that the script can access the variables we generated during startup
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Run the application
$*
