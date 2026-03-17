#!/bin/bash
# Initialize production database seed data.
#
# Run this script from inside the api container.
#
# By default runs both user and import-source initialization.
# Pass flags to run only specific steps.
#
# Usage:
#   bash bin/init_prod_data.sh                         # run both
#   bash bin/init_prod_data.sh --init-users            # users only
#   bash bin/init_prod_data.sh -u                      # users only (shorthand)
#   bash bin/init_prod_data.sh --init-import-sources   # import sources only
#   bash bin/init_prod_data.sh -i                      # import sources only (shorthand)
#   bash bin/init_prod_data.sh -u -i                   # explicitly run both
#
# Both scripts are idempotent and safe to re-run.

set -e

RUN_USERS=false
RUN_IMPORT_SOURCES=false

# Parse arguments
if [ $# -eq 0 ]; then
  RUN_USERS=true
  RUN_IMPORT_SOURCES=true
else
  for arg in "$@"; do
    case "$arg" in
      --init-users|-u)
        RUN_USERS=true
        ;;
      --init-import-sources|-i)
        RUN_IMPORT_SOURCES=true
        ;;
      *)
        echo "Unknown option: $arg"
        echo ""
        echo "Usage: $(basename "$0") [--init-users|-u] [--init-import-sources|-i]"
        echo "  (no flags) — run both"
        exit 1
        ;;
    esac
  done
fi

echo "=== init_prod_data ==="
echo "Users:          $RUN_USERS"
echo "Import sources: $RUN_IMPORT_SOURCES"
echo ""

if $RUN_USERS; then
  echo "--- Initializing users ---"
  node src/scripts/init_prod_users.js
  echo ""
fi

if $RUN_IMPORT_SOURCES; then
  echo "--- Initializing import sources ---"
  node src/scripts/init_prod_import_sources.js
  echo ""
fi

echo "=== Done ==="
