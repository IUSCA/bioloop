#!/bin/bash

# Signet (OAuth2 authorization server) entrypoint.

echo "=== Signet entrypoint start ==="

# RSA key pair used by Signet to sign OAuth2 access tokens.
# Other services (API, secure_download) use the corresponding public key to
# verify those tokens without needing to contact Signet on every request.
if [ -f "keys/auth.key" ] && [ -f "keys/auth.pub" ]; then
  echo "RSA keys already exist. Skipping generation."
else
  echo "Generating RSA keys..."
  cd keys/
  ./genkeys.sh
  cd ../
  echo "RSA key generation done."
fi

echo "=== Signet entrypoint complete ==="
$*
