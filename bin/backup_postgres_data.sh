#!/bin/bash

# prompts for password

dt=$(date +"%Y%m%dT%H%M%S");

pg_dump\
    --dbname=dgl_test \
    --file="dgl-$dt-dump.sql" \
    --column-inserts \
    --data-only \
    --username=dgluser \
    --host=localhost \
    --port=5433