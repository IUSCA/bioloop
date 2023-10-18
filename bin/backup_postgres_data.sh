#!/bin/bash

# ssh -A -L 5433:commons3.sca.iu.edu:5432 appuser@app-server1.sca.iu.edu
# prompts for password - does not need to be percent encoded even if it contains URL unsafe characters.

dt=$(date +"%Y%m%dT%H%M%S");

pg_dump\
    --dbname=app \
    --file="$dt-dump.sql" \
    --column-inserts \
    --data-only \
    --username=appuser \
    --host=localhost \
    --port=5433