#!/bin/bash

# replace the dump.sql with the path to the actual dump file generated by backup script.

psql \
    -h localhost \
    -p 5433 \
    -d app \
    -U appuser \
    --password < 'dump.sql'