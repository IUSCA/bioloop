#!/bin/bash
set -e
set -o pipefail

# Get the list of staged files
staged_files=$(git diff --name-only --cached)

# Initialize variables
ui_files=""
api_files=""

# Iterate over staged files
for file in $staged_files; do
  # Remove 'ui/' or 'api/' prefix and store in respective variables
  if [[ $file == ui/* ]]; then
    ui_file=${file#ui/}
    ui_files="$ui_files $ui_file"
  elif [[ $file == api/* ]]; then
    api_file=${file#api/}
    api_files="$api_files $api_file"
  fi
done

# Run eslint on UI files
if [[ -n $ui_files ]]; then
  cd ui/
  echo "Running eslint on UI files..."
  node_modules/.bin/eslint $ui_files
  cd ..
fi

# Run eslint on API files
if [[ -n $api_files ]]; then
  cd api/
  echo "Running eslint on API files..."
  node_modules/.bin/eslint $api_files
  cd ..
fi
