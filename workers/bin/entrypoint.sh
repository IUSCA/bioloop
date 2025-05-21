#!/bin/bash
set -e


echo "Waiting for .env file to be ready..."
while [ ! -f ".env" ] || ! grep -q "^APP_API_TOKEN=[^ ]\+" ".env"; do
  echo "Waiting for .env file to be ready and contain APP_API_TOKEN..."
  sleep 1
done


if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi


echo ".env file is ready. Starting the worker..."
exec "$@"