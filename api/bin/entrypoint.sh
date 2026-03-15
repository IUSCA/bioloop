#!/bin/bash

# API service entrypoint.
#
# Runs once per container start.  Performs all one-time and idempotent setup
# steps before handing off to the main process (npm run dev).

echo "=== API entrypoint start ==="

# workers/.env is created here so the Celery worker container (which mounts
# this same workers/ directory) can read tokens written by this script.
if [ ! -f "workers/.env" ]; then
  echo "Creating workers/.env..."
  touch workers/.env
fi

# Block until the rhythm container has written WORKFLOW_AUTH_TOKEN to .env.
# Rhythm generates this token and writes it to api/.env during its own startup;
# the API uses it to authenticate outbound requests to the Rhythm workflow API.
echo "Waiting for WORKFLOW_AUTH_TOKEN in .env..."
_WAIT_START=$(date +%s)
while ! grep -q "^WORKFLOW_AUTH_TOKEN=[^ ]\+" ".env"; do
  echo "  [$(date '+%H:%M:%S')] Still waiting for .env / WORKFLOW_AUTH_TOKEN..."
  sleep 1
done
echo "WORKFLOW_AUTH_TOKEN ready (waited $(( $(date +%s) - _WAIT_START ))s)"

# Load .env so subsequent commands (e.g. openssl, node scripts) can read secrets.
export $(grep -v '^#' .env | xargs)

# RSA key pair used to sign and verify JWTs issued by this API service.
# Keys are stored in a named Docker volume so they persist across container restarts.
if [ -f "keys/auth.pub" ] && [ -f "keys/auth.key" ]; then
  echo "RSA keys already exist. Skipping generation."
else
  echo "Generating RSA keys..."
  cd keys
  openssl genrsa -out auth.key 2048
  chmod 600 auth.key
  openssl rsa -in auth.key -pubout > auth.pub
  cd ..
  echo "RSA key generation done."
fi

# Install Node dependencies.
# Skipped when package-lock.json is unchanged and node_modules/.bin is populated,
# saving ~30 s on warm restarts.  The hash is stored inside the named-volume-backed
# node_modules so it persists across restarts and is wiped on a full environment reset.
# Checking node_modules/.bin guards against a broken install where the hash file
# was written but the actual package executables are missing.
echo "Checking if npm install is needed..."
_LOCKFILE_HASH=$(md5sum package-lock.json 2>/dev/null | awk '{print $1}')
_HASH_FILE="node_modules/.install_hash"
_NODE_MODULES_VALID=false
if [ -f "$_HASH_FILE" ] && [ "$(cat "$_HASH_FILE" 2>/dev/null)" = "$_LOCKFILE_HASH" ] \
    && [ -d "node_modules/.bin" ] && [ -n "$(ls node_modules/.bin 2>/dev/null)" ]; then
  _NODE_MODULES_VALID=true
fi
if $_NODE_MODULES_VALID; then
  echo "node_modules up to date (lockfile unchanged). Skipping npm install."
else
  echo "Running npm install..."
  npm install
  echo "$_LOCKFILE_HASH" > "$_HASH_FILE"
  echo "npm install done."
fi

# Generate the typed Prisma client from prisma/schema.prisma.
# Skipped when the schema hasn't changed — regenerating takes ~10 s and is only
# needed after schema edits or a fresh install.
echo "Checking if prisma generate is needed..."
_SCHEMA_HASH=$(md5sum prisma/schema.prisma 2>/dev/null | awk '{print $1}')
_PRISMA_HASH_FILE="node_modules/.prisma_generate_hash"
if [ -f "$_PRISMA_HASH_FILE" ] && [ "$(cat "$_PRISMA_HASH_FILE" 2>/dev/null)" = "$_SCHEMA_HASH" ]; then
  echo "Prisma client up to date (schema unchanged). Skipping prisma generate."
else
  echo "Running prisma generate..."
  npx prisma generate
  echo "$_SCHEMA_HASH" > "$_PRISMA_HASH_FILE"
  echo "prisma generate done."
fi

# Apply any pending database migrations.  This is idempotent — already-applied
# migrations are skipped, so it is safe to run on every container start.
echo "Running prisma migrate deploy..."
npx prisma migrate deploy
echo "prisma migrate deploy done."

# Seed the database with initial data (roles, lookup tables, default users, etc.).
# The .db_seeded marker lives in the bind-mounted api/ directory and is removed by
# bin/docker-reset.sh alongside the database data, keeping seed state and DB in sync.
if [ -f ".db_seeded" ]; then
  echo "DB already seeded (.db_seeded marker present). Skipping seed."
else
  echo "Running prisma db seed..."
  npx prisma db seed
  touch .db_seeded
  echo "prisma db seed done."
fi

# Register an OAuth2 client with Signet (the OAuth2 authorization server).
# Signet issues the client_id/secret pair used by the secure_download and upload
# services to request access tokens.  If the placeholder "xxx" values are still
# present, registration hasn't happened yet on this environment.
echo "Checking OAuth client credentials..."
if [ "${OAUTH_DOWNLOAD_CLIENT_ID}" = "xxx" ] || [ "${OAUTH_DOWNLOAD_CLIENT_SECRET}" = "xxx" ] || [ "${OAUTH_UPLOAD_CLIENT_ID}" = "xxx" ] || [ "${OAUTH_UPLOAD_CLIENT_SECRET}" = "xxx" ]; then
  echo "Registering OAuth client with Signet..."
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

  # Write updated credentials to .env.
  # grep -v | cat is used instead of sed -i to avoid in-place edit failures
  # that occur on some bind mount implementations (e.g. virtiofs on macOS
  # Docker Desktop).  This pattern is portable and works on any platform.
  grep -v "^OAUTH_DOWNLOAD_CLIENT_ID\|^OAUTH_DOWNLOAD_CLIENT_SECRET\|^OAUTH_UPLOAD_CLIENT_ID\|^OAUTH_UPLOAD_CLIENT_SECRET" .env > /tmp/_env_tmp && cat /tmp/_env_tmp > .env && rm /tmp/_env_tmp
  echo "OAUTH_DOWNLOAD_CLIENT_ID=$client_id" >> .env
  export OAUTH_DOWNLOAD_CLIENT_ID=$client_id
  echo "OAUTH_DOWNLOAD_CLIENT_SECRET=$client_secret" >> .env
  export OAUTH_DOWNLOAD_CLIENT_SECRET=$client_secret
  echo "OAUTH_UPLOAD_CLIENT_ID=$client_id" >> .env
  export OAUTH_UPLOAD_CLIENT_ID=$client_id
  echo "OAUTH_UPLOAD_CLIENT_SECRET=$client_secret" >> .env
  export OAUTH_UPLOAD_CLIENT_SECRET=$client_secret
  echo "OAuth credentials written."
else
  echo "OAuth credentials already set. Skipping."
fi

# Generate a signed JWT for the Celery worker service so it can authenticate
# API requests.  Written to workers/.env, which the workers container reads on startup.
if ! grep -q "^APP_API_TOKEN=[^ ]\+" "workers/.env"; then
  echo "Generating APP_API_TOKEN..."
  APP_API_TOKEN=$(node src/scripts/issue_token.js svc_tasks)
  if [ $? -ne 0 ] || [ -z "$APP_API_TOKEN" ]; then
    echo "ERROR: Failed to generate APP_API_TOKEN."
    node src/scripts/issue_token.js svc_tasks
    exit 1
  fi
  echo "APP_API_TOKEN=$APP_API_TOKEN" >> workers/.env
  echo "APP_API_TOKEN written."
else
  echo "APP_API_TOKEN already set. Skipping."
fi

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "=== API entrypoint complete ==="
$*
