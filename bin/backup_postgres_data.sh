#!/bin/bash

# prompts for password

dt=$(date +"%Y%m%dT%H%M%S");

pg_dump\
    --dbname=app \
    --file="$dt-dump.sql" \
    --column-inserts \
    --data-only \
    --username=appuser \
    --host=localhost \
    --port=5433