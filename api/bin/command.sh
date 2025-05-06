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

  echo "One or more required environment variables are not set. Generating new OAuth client credentials..."
  response=$(curl --silent --request POST \
    --url http://signet:5050/create_client \
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


npm run dev
