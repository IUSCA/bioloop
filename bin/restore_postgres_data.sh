#!/bin/bash
psql \
    -h localhost \
    -p 5433 \
    -d dgl_test \
    -U dgluser \
    --password < dgl-2023_05_03_23_57_00-dump.sql