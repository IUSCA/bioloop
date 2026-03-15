#!/bin/bash

_START_TIME=$(date +%s)
ts() { printf "[%s +%ds] " "$(date '+%H:%M:%S')" "$(( $(date +%s) - _START_TIME ))"; }

ts; echo "=== API entrypoint start ==="

# check if .env file exists
if [ ! -f "workers/.env" ]; then
  ts; echo "Creating workers/.env..."
  touch workers/.env
fi

# Check if pre-requisites are installed
ts; echo "Waiting for WORKFLOW_AUTH_TOKEN in .env..."
_WAIT_START=$(date +%s)
while ! grep -q "^WORKFLOW_AUTH_TOKEN=[^ ]\+" ".env"; do
  echo "  [$(date '+%H:%M:%S')] Still waiting for .env / WORKFLOW_AUTH_TOKEN..."
  sleep 1
done
ts; echo "WORKFLOW_AUTH_TOKEN ready (waited $(( $(date +%s) - _WAIT_START ))s)"

# Dynamically load environment variables from .env file
export $(grep -v '^#' .env | xargs)

# Check if keys exists
if [ -f "keys/auth.pub" ] && [ -f "keys/auth.key" ]; then
  ts; echo "RSA keys already exist. Skipping generation."
else
  ts; echo "Generating RSA keys..."
  _T=$(date +%s)
  cd keys
  openssl genrsa -out auth.key 2048
  chmod 600 auth.key
  openssl rsa -in auth.key -pubout > auth.pub
  cd ..
  ts; echo "RSA key generation done ($(( $(date +%s) - _T ))s)"
fi

# Install dependencies — skip if package-lock.json hasn't changed since last install.
# The hash is stored inside the (named-volume-backed) node_modules so it persists
# across container restarts but is wiped on a Docker environment reset.
ts; echo "Checking if npm install is needed..."
_LOCKFILE_HASH=$(md5sum package-lock.json 2>/dev/null | awk '{print $1}')
_HASH_FILE="node_modules/.install_hash"
if [ -f "$_HASH_FILE" ] && [ "$(cat "$_HASH_FILE" 2>/dev/null)" = "$_LOCKFILE_HASH" ]; then
  ts; echo "node_modules up to date (lockfile unchanged). Skipping npm install."
else
  ts; echo "Running npm install..."
  _T=$(date +%s)
  npm install
  echo "$_LOCKFILE_HASH" > "$_HASH_FILE"
  ts; echo "npm install done ($(( $(date +%s) - _T ))s)"
fi

# Generate Prisma client — skip if schema hasn't changed since last generate.
ts; echo "Checking if prisma generate is needed..."
_SCHEMA_HASH=$(md5sum prisma/schema.prisma 2>/dev/null | awk '{print $1}')
_PRISMA_HASH_FILE="node_modules/.prisma_generate_hash"
if [ -f "$_PRISMA_HASH_FILE" ] && [ "$(cat "$_PRISMA_HASH_FILE" 2>/dev/null)" = "$_SCHEMA_HASH" ]; then
  ts; echo "Prisma client up to date (schema unchanged). Skipping prisma generate."
else
  ts; echo "Running prisma generate..."
  _T=$(date +%s)
  npx prisma generate
  echo "$_SCHEMA_HASH" > "$_PRISMA_HASH_FILE"
  ts; echo "prisma generate done ($(( $(date +%s) - _T ))s)"
fi

# Run database migrations — always run; it's a no-op when up to date.
ts; echo "Running prisma migrate deploy..."
_T=$(date +%s)
npx prisma migrate deploy
ts; echo "prisma migrate deploy done ($(( $(date +%s) - _T ))s)"

# Seed database — skip if already seeded.
# The marker file lives in the bind-mounted api/ directory and is removed by
# bin/docker-reset.sh alongside the DB data, keeping them in sync.
if [ -f ".db_seeded" ]; then
  ts; echo "DB already seeded (.db_seeded marker present). Skipping seed."
else
  ts; echo "Running prisma db seed..."
  _T=$(date +%s)
  npx prisma db seed
  touch .db_seeded
  ts; echo "prisma db seed done ($(( $(date +%s) - _T ))s)"
fi

ts; echo "Checking OAuth client credentials..."
if [ "${OAUTH_DOWNLOAD_CLIENT_ID}" = "xxx" ] || [ "${OAUTH_DOWNLOAD_CLIENT_SECRET}" = "xxx" ] || [ "${OAUTH_UPLOAD_CLIENT_ID}" = "xxx" ] || [ "${OAUTH_UPLOAD_CLIENT_SECRET}" = "xxx" ]; then
  ts; echo "Generating OAuth client credentials via signet..."
  _T=$(date +%s)
  response=$(curl --silent --request POST \
    --url http://signet:5050/create_client \
    --header 'Content-Type: application/x-www-form-urlencoded' \
    --data client_name=localhost_download \
    --data scope=download_file\ upload_file \
    --data client_uri=localhost \
    --data token_endpoint_auth_method=client_secret_basic \
    --data grant_type=client_credentials)

  echo "Response from server: $response"
  client_id=$(echo "$response" | grep -oP '(?<="client_id":")[^"]*')
  client_secret=$(echo "$response" | grep -oP '(?<="client_secret":")[^"]*')
  echo "Client ID: $client_id"
  echo "Client Secret: $client_secret"

  grep -v "^OAUTH_DOWNLOAD_CLIENT_ID\|^OAUTH_DOWNLOAD_CLIENT_SECRET\|^OAUTH_UPLOAD_CLIENT_ID\|^OAUTH_UPLOAD_CLIENT_SECRET" .env > /tmp/_env_tmp && cat /tmp/_env_tmp > .env && rm /tmp/_env_tmp
  echo "OAUTH_DOWNLOAD_CLIENT_ID=$client_id" >> .env
  export OAUTH_DOWNLOAD_CLIENT_ID=$client_id
  echo "OAUTH_DOWNLOAD_CLIENT_SECRET=$client_secret" >> .env
  export OAUTH_DOWNLOAD_CLIENT_SECRET=$client_secret
  echo "OAUTH_UPLOAD_CLIENT_ID=$client_id" >> .env
  export OAUTH_UPLOAD_CLIENT_ID=$client_id
  echo "OAUTH_UPLOAD_CLIENT_SECRET=$client_secret" >> .env
  export OAUTH_UPLOAD_CLIENT_SECRET=$client_secret
  ts; echo "OAuth credentials written ($(( $(date +%s) - _T ))s)"
else
  ts; echo "OAuth credentials already set. Skipping."
fi

if ! grep -q "^APP_API_TOKEN=[^ ]\+" "workers/.env"; then
  ts; echo "Generating APP_API_TOKEN..."
  _T=$(date +%s)
  APP_API_TOKEN=$(node src/scripts/issue_token.js svc_tasks)
  if [ $? -ne 0 ] || [ -z "$APP_API_TOKEN" ]; then
    echo "ERROR: Failed to generate APP_API_TOKEN."
    node src/scripts/issue_token.js svc_tasks
    exit 1
  fi
  echo "APP_API_TOKEN=$APP_API_TOKEN" >> workers/.env
  ts; echo "APP_API_TOKEN written ($(( $(date +%s) - _T ))s)"
else
  ts; echo "APP_API_TOKEN already set. Skipping."
fi

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

ts; echo "=== API entrypoint complete — total $(( $(date +%s) - _START_TIME ))s ==="
$*
