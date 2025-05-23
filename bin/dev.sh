#!/bin/bash
set -e
set -o pipefail

{ 
  echo "Finding the UID and GID of the provided user '"$APP_USER"' and group '"$APP_GROUP"'."
  APP_UID=$(id -u $APP_USER) && 
  APP_GID=$(grep "^$APP_GROUP:" /etc/group | cut -d: -f3) 

} || {

  echo "Failed to find the provided user and group; defaulting to the user and group of the current directory's owner."
  APP_UID=$(ls -ldn `pwd` | awk '{print $3}') &&
  APP_GID=$(ls -ldn `pwd` | awk '{print $4}')
}

echo "APP_UID:$APP_UID,APP_GID:$APP_GID"

echo APP_UID=$APP_UID > .env
echo APP_GID=$APP_GID >> .env

docker compose build api
docker compose up -d