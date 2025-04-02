#!/bin/bash
set -e

# Get the list of staged files
staged_files=$(git diff --cached --name-status | grep -E '^(A|M)' | awk '{print $2}')

# Exit early if no files are staged for addition or modification
if [[ -z "$staged_files" ]]; then
  # echo "No files staged for addition or modification. Exiting without linting."
  exit 0
fi

# check if any of the staged files are in the docs directory
# ignore this if any of the files from docs/.vitepress/dist is staged
if [[ -n $(echo "$staged_files" | grep -E '^docs/') ]] && [[ -z $(echo "$staged_files" | grep -E '^docs/.vitepress/dist/') ]]; then
  echo "Docs have changed but not built yet. Building docs..."
  docker compose run -T --rm --entrypoint "" docs npm run docs:build
  echo "Docs built successfully. Please stage the changes in docs/.vitepress/dist/ and commit again."
  exit 1
fi