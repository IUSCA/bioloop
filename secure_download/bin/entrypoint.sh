#!/bin/bash

_START_TIME=$(date +%s)
ts() { printf "[%s +%ds] " "$(date '+%H:%M:%S')" "$(( $(date +%s) - _START_TIME ))"; }

ts; echo "=== secure_download entrypoint start ==="

ts; echo "Checking if npm install is needed..."
_LOCKFILE_HASH=$(md5sum package-lock.json 2>/dev/null | awk '{print $1}')
_HASH_FILE="node_modules/.install_hash"
if [ -f "$_HASH_FILE" ] && [ "$(cat "$_HASH_FILE" 2>/dev/null)" = "$_LOCKFILE_HASH" ]; then
  ts; echo "node_modules up to date (lockfile unchanged). Skipping npm install."
else
  ts; echo "Running npm install..."
  _T=$(date +%s)
  npm install
  echo "$_LOCKFILE_HASH" > "$_HASH_FILE"
  ts; echo "npm install done ($(( $(date +%s) - _T ))s)"
fi

ts; echo "=== secure_download entrypoint complete — total $(( $(date +%s) - _START_TIME ))s ==="
$*
