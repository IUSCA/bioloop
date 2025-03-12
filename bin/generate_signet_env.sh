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
  
  if [ $key == "POSTGRES_DB" ]; then
    eval echo "SIGNET_DB"="\${$key}" >> $folder/signet.env
  fi

  if [ $key == "POSTGRES_USER" ]; then
    eval echo "SIGNET_USER"="\${$key}" >> $folder/signet.env
  fi

  if [ $key == "POSTGRES_PASSWORD" ]; then
    eval echo "SIGNET_PASSWORD"="\${$key}" >> $folder/signet.env
  fi

  eval echo "$key"="\${$key}" >> $folder/signet.env
done