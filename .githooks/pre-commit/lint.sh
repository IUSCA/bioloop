#!/bin/bash
set -e

# Get the list of staged files
staged_files=$(git diff --cached --name-status | grep -E '^(A|M)' | awk '{print $2}')

# Exit early if no files are staged for addition or modification
if [[ -z "$staged_files" ]]; then
  echo "No files staged for addition or modification. Exiting without linting."
  exit 0
fi

# spell check staged files
# echo $staged_files
# echo "Running spell check on staged files..."
set +e
output=$(npx cspell --no-progress $staged_files 2>&1)
cspellStatus=$?
set -e
# if cspellStatus is not 0
# if output contains "Files checked: 0" then do nothing
# else exit with cspellStatus

if [[ $cspellStatus -ne 0 ]]; then
  if [[ $output == *"Files checked: 0"* ]]; then
    :
  else
    echo "Spelling errors found:"
    echo "$output"
    exit $cspellStatus
  fi
fi

# echo "Running ESLint on staged files..."

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
