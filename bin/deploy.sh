#!/bin/bash
set -e
set -o pipefail

{ 
  echo "Finding the UID and GID of the provided user '"$APP_USER"' and group '"$APP_GROUP"'."
  APP_UID=$(id -u $APP_USER) && 
  APP_GID=$(grep "^$APP_GROUP:" /etc/group | cut -d: -f3) 

} || {

  echo "Failed to find the provided user and group; defaulting to the user and group of the current directory's onwer."
  APP_UID=$(ls -ldn `pwd` | awk '{print $3}') &&
  APP_GID=$(ls -ldn `pwd` | awk '{print $4}')
}

echo "APP_UID:$APP_UID,APP_GID:$APP_GID"

# Check if .env file exists
if [ ! -f .env ]; then
  # If it doesn't exist, create it
  touch .env
fi

# Check if APP_UID exists in the .env file
if grep -q "APP_UID" .env; then
  # If it exists, update it
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i "" "s/^APP_UID=.*/APP_UID=$APP_UID/" .env
  else
    sed -i "s/^APP_UID=.*/APP_UID=$APP_UID/" .env
  fi
else
  # If it doesn't exist, add it
  echo "" >> .env
  echo "APP_UID=$APP_UID" >> .env
fi

# Check if APP_GID exists in the .env file
if grep -q "APP_GID" .env; then
  # If it exists, update it
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i "" "s/^APP_GID=.*/APP_GID=$APP_GID/" .env
  else
    sed -i "s/^APP_GID=.*/APP_GID=$APP_GID/" .env
  fi
else
  # If it doesn't exist, add it
  echo "APP_GID=$APP_GID" >> .env
fi

# build API
sudo docker compose -f "docker-compose-prod.yml" build api

# starts postgres if it is not running
sudo docker compose -f "docker-compose-prod.yml" up -d postgres

# recreates and starts api and ui
sudo docker compose -f "docker-compose-prod.yml" up -d --force-recreate ui api