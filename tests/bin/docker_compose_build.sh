#!/bin/bash

echo "Getting environment variables from .env.example files ..."

#
# Read environment variables from .env.examples files into an array
#


# API
declare -A env_vars
while IFS='=' read -r key value; do
  if [[ $key != \#* ]]; then
    env_vars["$key"]="$value"
  fi
done < "../api/.env.example"

# UI
while IFS='=' read -r key value; do
  if [[ $key != \#* ]]; then
    env_vars[$key]="$value"
  fi
done < "../ui/.env.example"

# Tests
while IFS='=' read -r key value; do
  if [[ $key != \#* ]]; then
    env_vars["$key"]="$value"
  fi
done < ".env.example"

# DB
while IFS='=' read -r key value; do
  if [[ $key != \#* ]]; then
    env_vars["$key"]="$value"
  fi
done < "../db/postgres/.env.example"

#docker-compose build --build-arg db_username="${db_username}" --build-arg db_password="${db_password}"

# docker compose build \
# Make docker compose build passing in all environment variables
declare -i x=0
for key in "${!env_vars[@]}"; do
  echo "$key"="\${$key}" 
  # --build-arg "$key"="${$key}" \

  x=$((x + 1))

done

echo "$x"