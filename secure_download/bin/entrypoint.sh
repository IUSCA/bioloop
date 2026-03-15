#!/bin/bash

_START_TIME=$(date +%s)
ts() { printf "[%s +%ds] " "$(date '+%H:%M:%S')" "$(( $(date +%s) - _START_TIME ))"; }

ts; echo "=== secure_download entrypoint start ==="

ts; echo "Running npm install..."
_T=$(date +%s)
npm install
ts; echo "npm install done ($(( $(date +%s) - _T ))s)"

ts; echo "=== secure_download entrypoint complete — total $(( $(date +%s) - _START_TIME ))s ==="
$*
