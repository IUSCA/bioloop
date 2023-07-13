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
    extension=${ui_file##*.}
    if [[ $extension == vue || $extension == js || $extension == jsx || $extension == cjs || $extension == mjs ]]; then
      ui_files="$ui_files $ui_file"
    fi
  elif [[ $file == api/* ]]; then
    api_file=${file#api/}
    extension=${api_file##*.}
    if [[ $extension == vue || $extension == js || $extension == jsx || $extension == cjs || $extension == mjs ]]; then
      api_files="$api_files $api_file"
    fi
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
