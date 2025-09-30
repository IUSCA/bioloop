#!/bin/bash
set -e


echo "Downloading and setting up the rhythm_api and signet repositories..."
echo "If this fails clone the repositories manually into the rhythm and signet directories"

# # Download the rhythm_api repository if it doesn't exist
if [ ! -d "rhythm/rhythm_api" ]; then cd rhythm; git clone https://github.com/IUSCA/rhythm_api.git; cd ..; fi


# Download the signet repository if it doesn't exist
if [ ! -d "signet/signet" ]; then cd signet; git clone https://github.com/IUSCA/signet.git; cd ..; fi


# Check .env file for api and workers
echo "Checking .env files for api and workers..."
echo "If this fails create an empty .env file manually in the api and workers directories.  This will be filled in by the cmd script."

if [ ! -f  "api/.env" ]; then
  echo "Creating api/.env file..."
  touch api/.env
fi

if [ ! -f  "workers/.env" ]; then
  echo "Creating workers/.env file..."
  touch workers/.env
fi