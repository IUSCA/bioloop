#!/bin/bash

# prompts for password

dt=$(date +"%Y%m%dT%H%M%S");

pg_dump\
    --dbname=cfndap \
    --file="$dt-dump.sql" \
    --column-inserts \
    --data-only \
    --username=cfndap \
    --host=localhost \
    --port=5433