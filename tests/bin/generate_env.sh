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
done < "./.env.example"

# DB
while IFS='=' read -r key value; do
  if [[ $key != \#* ]]; then
    env_vars["$key"]="$value"
  fi
done < "../db/postgres/.env.example"


# Make docker compose build passing in all environment variables
for key in "${!env_vars[@]}"; do
  eval echo "$key"="\${$key}"
  eval echo "$key"="\${$key}" >> .env
done
