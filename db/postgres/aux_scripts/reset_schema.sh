#!/bin/bash

# This script is used to reset the postgres database to a clean state.
SCHEMA_NAME=$1

echo "Resetting schema $SCHEMA_NAME"

psql --username=$POSTGRES_USER --dbname=$POSTGRES_DB -c "
  DROP SCHEMA IF EXISTS $SCHEMA_NAME CASCADE;
  CREATE SCHEMA $SCHEMA_NAME;
"