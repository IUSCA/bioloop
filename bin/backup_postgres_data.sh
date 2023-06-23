#!/bin/bash

# prompts for password

dt=$(date +"%Y%m%dT%H%M%S");

pg_dump\
    --dbname=cpa \
    --file="$dt-dump.sql" \
    --column-inserts \
    --data-only \
    --username=cpa \
    --host=localhost \
    --port=5433