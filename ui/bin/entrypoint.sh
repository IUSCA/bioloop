#!/bin/bash

# UI service entrypoint.

echo "=== UI entrypoint start ==="

# Vite's dev server requires HTTPS for certain browser APIs (e.g. secure cookies).
# These are self-signed certs for local development only — not checked into version
# control and not used in production.  rsa:2048 is used instead of 4096 for faster
# generation; adequate for local dev.
if [ ! -d ".cert" ]; then
  mkdir .cert
fi

if [ -f .cert/cert.pem ] && [ -f .cert/key.pem ]; then
  echo "TLS certs already exist. Skipping generation."
else
  echo "Generating self-signed TLS cert (rsa:2048)..."
  cd .cert
  openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes \
    -subj "/C=US/ST=IN/L=Bloomington/O=IU/OU=SCA/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    -addext "extendedKeyUsage=serverAuth" \
    -addext "keyUsage=digitalSignature,keyEncipherment"
  cd ..
  echo "TLS cert generation done."
fi

# Install Node dependencies.
# Skipped when package-lock.json is unchanged and node_modules/.bin is populated,
# saving ~30 s on warm restarts.  The hash is stored inside the named-volume-backed
# node_modules so it persists across restarts and is wiped on a full environment reset.
# Checking node_modules/.bin guards against a broken install where the hash file
# was written but the actual package executables are missing.
echo "Checking if npm install is needed..."
_LOCKFILE_HASH=$(md5sum package-lock.json 2>/dev/null | awk '{print $1}')
_HASH_FILE="node_modules/.install_hash"
_NODE_MODULES_VALID=false
if [ -f "$_HASH_FILE" ] && [ "$(cat "$_HASH_FILE" 2>/dev/null)" = "$_LOCKFILE_HASH" ] \
    && [ -d "node_modules/.bin" ] && [ -n "$(ls node_modules/.bin 2>/dev/null)" ]; then
  _NODE_MODULES_VALID=true
fi
if $_NODE_MODULES_VALID; then
  echo "node_modules up to date (lockfile unchanged). Skipping npm install."
else
  echo "Running npm install..."
  npm install
  echo "$_LOCKFILE_HASH" > "$_HASH_FILE"
  echo "npm install done."
fi

echo "=== UI entrypoint complete ==="
$*
