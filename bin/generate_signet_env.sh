#!/bin/bash

echo "Getting environment variables from .env.example file ..."

#
# Read environment variables from .env.examples files into an array
#

folder=$1


# Signet
echo "Generating signet.env file ..."
declare -A env_vars
while IFS='=' read -r key value; do
  if [[ $key != \#* ]]; then
    env_vars["$key"]="$value"
  fi
done < "signet/.env.example"

for key in "${!env_vars[@]}"; do
  eval echo "$key"="\${$key}"
  
  if [ "$key" == "POSTGRES_DB" ]; then
    eval echo "SIGNET_DB"="${SIGNET_DB}" >> $folder/signet.env
    continue
  fi

  if [ "$key" == "POSTGRES_USER" ]; then
    eval echo "SIGNET_USER"="${SIGNET_USER}" >> $folder/signet.env
    continue
  fi

  if [ "$key" == "POSTGRES_PASSWORD" ]; then
    eval echo "SIGNET_PASSWORD"="${SIGNET_PASSWORD}" >> $folder/signet.env
    continue
  fi

  if [ "$key" == "POSTGRES_HOST" ]; then
    eval echo "SIGNET_DB_HOST"="${SIGNET_DB_HOST}" >> $folder/signet.env
    continue
  fi

  eval echo "$key"="\${$key}" >> $folder/signet.env
done

cat $folder/signet.env