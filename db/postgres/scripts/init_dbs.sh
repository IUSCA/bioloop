
#!/usr/bin/env bash


if [ -z "$POSTGRES_USER" ]; then
  echo "POSTGRES_USER is not set. Exiting."
  exit 1
fi

echo "Enabling pgcrypto on database $POSTGRES_DB"
psql -U $POSTGRES_USER --dbname="$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EOSQL