#!/bin/bash

# Check for required parameter
if [ -z "$1" ]; then
  echo "Usage: $0 <archive_file>"
  exit 1
fi



# Identify archive type
case "$(file --brief --mime-type "$1")" in
  "application/x-tar"*)
    echo "Extracting tar archive: $1"
    tar -xf "$1" --no-same-permissions -C $(dirname "$1") && rm "$1"
    ;;
  "application/x-gzip"*)
    echo "Extracting gzip archive: $1"
    mv "$1" "$1.gz"
    gunzip -d "$1" 
    if [ $(file --brief --mime-type "$1") == "application/x-tar" ]; then
      echo "Extracting tar archive: $1"
      tar --no-same-permissions -xf "$1" -C $(dirname "$1") && rm "$1"
      chmod -R 0700 $(dirname "$1")
    fi
    
    ;;
  "application/x-bzip2"*)
    echo "Extracting bzip2 archive: $1"
    bunzip2 -d "$1"
    if [ $(file --brief --mime-type "$1") == "application/x-tar" ]; then
      echo "Extracting tar archive: $1"
      tar --no-same-permissions -xf "$1" -C $(dirname "$1") && rm "$1"
      chmod -R 0700 $(dirname "$1")
    fi
    ;;
  "application/zip"*)
    echo "Extracting zip archive: $1"
    unzip -d "$1"
    ;;
  *)
    echo "Does not need unzipping: $1"
    ;;
esac
