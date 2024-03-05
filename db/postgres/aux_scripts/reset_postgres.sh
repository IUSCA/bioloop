#!/bin/bash

# This script is used to reset the postgres database to a clean state.
SCHEMA_NAME=$1

# run this command to get the drop statements
psql --username=$POSTGRES_USER --dbname=$POSTGRES_DB --no-align --tuples-only --quiet -c "
SELECT 'DROP TABLE IF EXISTS \"' || table_name || '\" CASCADE;' as drop_statement
FROM information_schema.tables
WHERE table_schema = '$SCHEMA_NAME';
" > drop_statements.sql

# Add the DROP TYPE statement to the file
echo "DROP TYPE IF EXISTS $SCHEMA_NAME."access_type";" >> drop_statements.sql

# Execute the saved output
psql --username=$POSTGRES_USER --dbname=$POSTGRES_DB -f drop_statements.sql

# Remove the file
rm drop_statements.sql