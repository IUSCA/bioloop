#!/bin/bash
psql \
    -h localhost \
    -p 5433 \
    -d app \
    -U appuser \
    --password < '2023_05_03_23_57_00-dump.sql'