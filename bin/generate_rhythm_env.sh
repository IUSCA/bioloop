#!/bin/bash

echo "Getting environment variables from .env.example file ..."

#
# Read environment variables from .env.examples files into an array
#


# DB
echo "Generating db.env file ..."
declare -A env_vars
while IFS='=' read -r key value; do
  if [[ $key != \#* ]]; then
    env_vars["$key"]="$value"
  fi
done < "./rhythm_api/.env.example"

for key in "${!env_vars[@]}"; do
  eval echo "$key"="\${$key}"
  eval echo "$key"="\${$key}" >> rhythm_api/rhythm.env
done