#!/bin/bash

# Check for required parameter
if [ -z "$1" ]; then
  echo "Usage: $0 <archive_file>"
  exit 1
fi



# Identify archive type
case "$(file --brief --mime-type "$1")" in
  "application/x-tar"*)
    tar -xf "$1" -C "$1"
    ;;
  "application/x-gzip"*)
    mv "$1" "$1.gz"
    gunzip -d "$1" 
    if [ $(file --brief --mime-type "$1") == "application/x-tar" ]; then
      tar --no-same-permissions -xf "$1"
    fi
    
    ;;
  "application/x-bzip2"*)
    bunzip2 -d "$1"
    if [ $(file --brief --mime-type "$1") == "application/x-tar" ]; then
      tar --no-same-permissions -xf "$1"
    fi
    ;;
  "application/zip"*)
    unzip "$1" -d "$1"
    ;;
  *)
    echo "Does not need unzipping: $1"
    exit 1
    ;;
esac

echo "Extracted archive: $1"