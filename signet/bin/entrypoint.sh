#!/bin/bash

_START_TIME=$(date +%s)
ts() { printf "[%s +%ds] " "$(date '+%H:%M:%S')" "$(( $(date +%s) - _START_TIME ))"; }

ts; echo "=== Signet entrypoint start ==="

if [ -f "keys/auth.key" ] && [ -f "keys/auth.pub" ]; then
  ts; echo "RSA keys already exist. Skipping generation."
else
  ts; echo "Generating RSA keys..."
  _T=$(date +%s)
  cd keys/
  ./genkeys.sh
  cd ../
  ts; echo "RSA key generation done ($(( $(date +%s) - _T ))s)"
fi

ts; echo "=== Signet entrypoint complete — total $(( $(date +%s) - _START_TIME ))s ==="
$*
