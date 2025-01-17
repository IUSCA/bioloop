#!/bin/bash

echo "Getting environment variables from .env.example files ..."

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
done < "db/postgres/.env.example"

for key in "${!env_vars[@]}"; do
  eval echo "$key"="\${$key}"
  eval echo "$key"="\${$key}" >> db.env
done

# API
echo "Generating api.env file ..."
declare -A env_vars=()
while IFS='=' read -r key value; do
  if [[ $key != \#* ]]; then
    env_vars["$key"]="$value"
  fi
done < "api/.env.example"

for key in "${!env_vars[@]}"; do
  eval echo "$key"="\${$key}"
  eval echo "$key"="\${$key}" >> api.env
done


# UI
echo "Generating ui.env file ..."
declare -A env_vars=()
while IFS='=' read -r key value; do
  if [[ $key != \#* ]]; then
    env_vars[$key]="$value"
  fi
done < "ui/.env.example"

for key in "${!env_vars[@]}"; do
  eval echo "$key"="\${$key}"
  eval echo "$key"="\${$key}" >> ui.env
done

# Workers
echo "Generating workers.env file ..."
declare -A env_vars=()
while IFS='=' read -r key value; do
  if [[ $key != \#* ]]; then
    env_vars["$key"]="$value"
  fi
done < "workers/.env.example"

for key in "${!env_vars[@]}"; do
  eval echo "$key"="\${$key}"
  eval echo "$key"="\${$key}" >> workers.env
done