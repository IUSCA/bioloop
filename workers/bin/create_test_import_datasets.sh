#!/bin/bash
set -e

# =============================================================================
# Test Import Dataset Creation Script
# =============================================================================
#
# Creates small sample dataset directories inside the configured import source
# paths so that the import UI has browsable content out of the box in the
# docker/dev environment.
#
# Idempotency:
#   - If a directory matching a planned dataset's base name already exists
#     inside the target import source, that dataset is skipped.
#   - Before creating a new directory, the script calls the Bioloop API to
#     confirm no dataset with that name is already registered in the database.
#     If the preferred name is taken, numeric suffixes (_2, _3, …) are tried
#     until a free name is found.
#
# Prerequisites:
#   - APP_API_TOKEN must be present in .env (written by the API on startup).
#   - The import source directories must already exist (created by init_dirs.sh).
#   - The API must be reachable at API_BASE_URL.
#
# Usage:
#   This script is run by the init_test_data docker-compose service, which
#   depends on init_data_dirs (service_completed_successfully) and api
#   (service_healthy), ensuring both prerequisites are met before this runs.
# =============================================================================

API_BASE_URL="${API_BASE_URL:-http://api:3030}"

# ---------------------------------------------------------------------------
# Wait for APP_API_TOKEN to be written to .env by the API container.
# Even though we depend on api:service_healthy, the token write and health
# check completion are nearly simultaneous; this guard removes any race.
# ---------------------------------------------------------------------------
echo "Waiting for APP_API_TOKEN in .env..."
_WAIT_START=$(date +%s)
while [ ! -f ".env" ] || ! grep -q "^APP_API_TOKEN=[^ ]\+" ".env"; do
  echo "  [$(date '+%H:%M:%S')] Still waiting for .env / APP_API_TOKEN..."
  sleep 1
done
echo "APP_API_TOKEN ready (waited $(( $(date +%s) - _WAIT_START ))s)"

export $(grep -v '^#' .env | xargs)

# ---------------------------------------------------------------------------
# dataset_exists <name>
#   Returns 0 (true) if a RAW_DATA dataset with the given name is registered
#   in the database, 1 (false) otherwise.
# ---------------------------------------------------------------------------
dataset_exists() {
  local name="$1"
  local response
  response=$(curl -sf \
    -H "Authorization: Bearer ${APP_API_TOKEN}" \
    "${API_BASE_URL}/datasets/RAW_DATA/${name}/exists") || return 1
  echo "$response" | grep -q '"exists":true'
}

# ---------------------------------------------------------------------------
# create_test_dataset <import_source_dir> <preferred_name>
#   Creates a small dataset directory inside import_source_dir.  The directory
#   is named preferred_name if that name is not already registered; otherwise
#   preferred_name_2, preferred_name_3, … until a free name is found.
#
#   If any directory in import_source_dir already starts with preferred_name
#   (indicating a previous run of this script), the call is a no-op.
# ---------------------------------------------------------------------------
create_test_dataset() {
  local import_source="$1"
  local preferred_name="$2"

  # Check whether a previous run already created a dir for this dataset.
  if ls "${import_source}/" 2>/dev/null | grep -q "^${preferred_name}"; then
    echo "Skipping '${preferred_name}' — directory already present in ${import_source}"
    return
  fi

  # Find a name that is not yet registered in the dataset database.
  local name="$preferred_name"
  local suffix=2
  while dataset_exists "$name"; do
    echo "  Name '${name}' is already registered — trying '${preferred_name}_${suffix}'"
    name="${preferred_name}_${suffix}"
    suffix=$(( suffix + 1 ))
  done

  local dir="${import_source}/${name}"
  mkdir -p "$dir"

  # Write a few small text files so the directory is non-empty and browsable.
  printf "Sample import dataset: %s\nImport source: %s\n" "$name" "$import_source" \
    > "${dir}/README.txt"
  printf "col_a,col_b,col_c\n1,alpha,0.1\n2,beta,0.2\n3,gamma,0.3\n" \
    > "${dir}/data.csv"

  echo "Created test dataset directory: ${dir}"
}

# ---------------------------------------------------------------------------
# Dataset definitions
# Two import sources × three datasets each
# ---------------------------------------------------------------------------
SOURCE_1="/opt/sca/data/imports/genomics_lab_instrument_drop"
SOURCE_2="/opt/sca/data/imports/proteomics_lab_instrument_drop"

echo "=== Creating test import datasets ==="

create_test_dataset "$SOURCE_1" "import_sample_dataset_A"
create_test_dataset "$SOURCE_1" "import_sample_dataset_B"
create_test_dataset "$SOURCE_1" "import_sample_dataset_C"

create_test_dataset "$SOURCE_2" "import_sample_dataset_D"
create_test_dataset "$SOURCE_2" "import_sample_dataset_E"
create_test_dataset "$SOURCE_2" "import_sample_dataset_F"

echo "=== Test import dataset creation complete ==="
