
#!/usr/bin/env bash

echo "enabling pgcrypto on database $POSTGRES_DB"
psql -U $POSTGRES_USER --dbname="$POSTGRES_DB" <<-'EOSQL'
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EOSQL
