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
  ts; echo "Generating self-signed TLS cert (rsa:4096)..."
  _T=$(date +%s)
  cd .cert
  openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/C=US/ST=IN/L=Bloomington/O=IU/OU=SCA/CN=localhost"
  cd ..
  ts; echo "TLS cert generation done ($(( $(date +%s) - _T ))s)"
fi

ts; echo "Running npm install..."
_T=$(date +%s)
npm install
ts; echo "npm install done ($(( $(date +%s) - _T ))s)"

ts; echo "=== UI entrypoint complete — total $(( $(date +%s) - _START_TIME ))s ==="
$*
