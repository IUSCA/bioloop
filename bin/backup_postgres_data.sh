#!/bin/bash

# prompts for password

pg_dump\
    --dbname=dgl_test\
    --file=dgl-2023_05_03_23_57_00-dump.sql\
    --column-inserts\
    --data-only\
    --username=dgluser\
    --host=localhost\
    --port=5433