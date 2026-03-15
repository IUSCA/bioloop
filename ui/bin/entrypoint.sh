#!/bin/bash

_START_TIME=$(date +%s)
ts() { printf "[%s +%ds] " "$(date '+%H:%M:%S')" "$(( $(date +%s) - _START_TIME ))"; }

ts; echo "=== UI entrypoint start ==="

# Check if .cert directory exists
if [ ! -d ".cert" ]; then
  mkdir .cert
fi

if [ -f .cert/cert.pem ] && [ -f .cert/key.pem ]; then
  ts; echo "TLS certs already exist. Skipping generation."
else
  ts; echo "Generating self-signed TLS cert (rsa:2048)..."
  _T=$(date +%s)
  cd .cert
  openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/C=US/ST=IN/L=Bloomington/O=IU/OU=SCA/CN=localhost"
  cd ..
  ts; echo "TLS cert generation done ($(( $(date +%s) - _T ))s)"
fi

ts; echo "Checking if npm install is needed..."
_LOCKFILE_HASH=$(md5sum package-lock.json 2>/dev/null | awk '{print $1}')
_HASH_FILE="node_modules/.install_hash"
# Also verify node_modules/.bin is non-empty — a partial/interrupted install
# can leave the hash file behind while packages are missing.
_NODE_MODULES_VALID=false
if [ -f "$_HASH_FILE" ] && [ "$(cat "$_HASH_FILE" 2>/dev/null)" = "$_LOCKFILE_HASH" ] \
    && [ -d "node_modules/.bin" ] && [ -n "$(ls node_modules/.bin 2>/dev/null)" ]; then
  _NODE_MODULES_VALID=true
fi
if $_NODE_MODULES_VALID; then
  ts; echo "node_modules up to date (lockfile unchanged). Skipping npm install."
else
  ts; echo "Running npm install..."
  _T=$(date +%s)
  npm install
  echo "$_LOCKFILE_HASH" > "$_HASH_FILE"
  ts; echo "npm install done ($(( $(date +%s) - _T ))s)"
fi

ts; echo "=== UI entrypoint complete — total $(( $(date +%s) - _START_TIME ))s ==="
$*
