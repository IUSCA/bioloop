#!/bin/bash

# Check if node_modules exists and is empty
if [ -d "node_modules" ] && [ "$(ls -A node_modules)" ]; then
  echo "node_modules already exists and is not empty. Skipping npm install."
else
  echo "node_modules not found or empty. Running npm install..."
  npm install
fi

$*