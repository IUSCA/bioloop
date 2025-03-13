
#!/usr/bin/env bash


if [ -z "$POSTGRES_USER" ]; then
  echo "POSTGRES_USER is not set. Exiting."
  exit 1
fi

if [ -z "$SIGNET_DB" ] || [ -z "$SIGNET_USER" ] || [ -z "$SIGNET_PASSWORD" ]; then
  echo "One or more required environment variables (SIGNET_DB, SIGNET_USER, SIGNET_PASSWORD) are not set. Exiting."
  exit 1
fi

if [ -z "$SECURE_DOWNLOAD_DB" ] || [ -z "$SECURE_DOWNLOAD_USER" ] || [ -z "$SECURE_DOWNLOAD_PASSWORD" ]; then
  echo "One or more required environment variables (SECURE_DOWNLOAD_DB, SECURE_DOWNLOAD_USER, SECURE_DOWNLOAD_PASSWORD) are not set. Exiting."
  exit 1
fi

echo "Creating database $SIGNET_DB and user $SIGNET_USER with password $SIGNET_PASSWORD"
psql -U $POSTGRES_USER --dbname="$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE $SIGNET_DB;
  CREATE USER $SIGNET_USER WITH ENCRYPTED PASSWORD '$SIGNET_PASSWORD';
  GRANT ALL PRIVILEGES ON DATABASE $SIGNET_DB TO $SIGNET_USER;
EOSQL

echo "Creating database $SECURE_DOWNLOAD_DB and user $SECURE_DOWNLOAD_USER with password $SIGNET_PASSWORD"
psql -U $POSTGRES_USER --dbname="$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE $SECURE_DOWNLOAD_DB;
  CREATE USER $SECURE_DOWNLOAD_USER WITH ENCRYPTED PASSWORD '$SIGNET_PASSWORD';
  GRANT ALL PRIVILEGES ON DATABASE $SECURE_DOWNLOAD_DB TO $SECURE_DOWNLOAD_USER;
EOSQL


echo "Enabling pgcrypto on database $POSTGRES_DB"
psql -U $POSTGRES_USER --dbname="$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EOSQL