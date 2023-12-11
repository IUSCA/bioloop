#!/bin/bash

# Check for required parameter
if [ -z "$1" ]; then
  echo "Usage: $0 <archive_file>"
  exit 1
fi

# Get file name without extension
file_name="${1%.*}"

# Identify archive type
case "$(file --brief --mime-type "$1")" in
  "application/x-tar"*)
    tar -xf "$1" -C "$file_name"
    ;;
  "application/x-gzip"*)
    gunzip -c "$1" | tar --no-same-permissions -xf - -C "$file_name"
    ;;
  "application/x-bzip2"*)
    bunzip2 -c "$1" | tar --no-same-permissions -xf - -C "$file_name"
    ;;
  "application/zip"*)
    unzip "$1" -d "$file_name"
    ;;
  *)
    echo "Does not need unzipping: $1"
    exit 1
    ;;
esac

echo "Extracted archive: $1"