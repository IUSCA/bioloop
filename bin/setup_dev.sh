#!/bin/bash
set -e




# # Download the rhythm_api repository if it doesn't exist
# if [ ! -d "rhythm/rhythm_api" ]; then git clone https://github.com/IUSCA/rhythm_api.git; fi

# # Generate keys
if [ -f "rhythm/rhythm_api/keys/auth.key" ] && [ -f "rhythm/rhythm_api/keys/auth.pub" ]; then 
  echo "Keys already exist. Skipping key generation."
else
  cd rhythm/rhythm_api/keys/
  ./genkeys.sh
fi

# Download the signet repository if it doesn't exist
if [ ! -d "signet/signet" ]; then git clone https://github.com/IUSCA/signet.git; fi

if [ -f "signet/signet/keys/auth.key" ] && [ -f "signet/signet/keys/auth.pub" ]; then 
  echo "Keys already exist. Skipping key generation."
else
  # Generate keys 
  cd signet/signet/keys/
  ./genkeys.sh
  cd ../../../
fi



# stop the services so that the new environment vars can be loaded
docker compose down

# Start the services
docker compose up -d
