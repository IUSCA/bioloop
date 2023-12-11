#!/bin/bash

# Check for required parameter
if [ -z "$1" ]; then
  echo "Usage: $0 <archive_file>"
  exit 1
fi



# Identify archive type
case "$(file --brief --mime-type "$1")" in
  "application/x-tar"*)
    cat "$1 | tar -xf - -C "
    tar -xf "$1" -C "$1"
    ;;
  "application/x-gzip"*)
    cat "$1 | gzip -d | tar -xf - -C "
    gunzip -d "$1" 
    if [ $(file --brief --mime-type "$1") == "application/x-tar" ]; then
      tar --no-same-permissions -xf - -C "$1"
    fi
    
    ;;
  "application/x-bzip2"*)
    bunzip2 -c "$1" | tar --no-same-permissions -xf - -C "$1"
    if [ $(file --brief --mime-type "$1") == "application/x-tar" ]; then
      tar --no-same-permissions -xf - -C "$1"
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