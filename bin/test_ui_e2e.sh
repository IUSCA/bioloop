#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose-e2e.yml"

cleanup() {
  local exit_code=$?

  echo "Stopping the isolated E2E stack and deleting its temporary data..."
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans

  return "$exit_code"
}

wait_for_test_data() {
  local container_id
  local deadline=$((SECONDS + 300))
  local exit_code
  local status

  container_id="$(
    docker compose -f "$COMPOSE_FILE" ps -a -q init_test_data
  )"

  if [[ -z "$container_id" ]]; then
    echo "Could not find the init_test_data container."
    return 1
  fi

  while (( SECONDS < deadline )); do
    status="$(docker inspect --format '{{.State.Status}}' "$container_id")"

    if [[ "$status" == "exited" ]]; then
      exit_code="$(
        docker inspect --format '{{.State.ExitCode}}' "$container_id"
      )"

      if [[ "$exit_code" == "0" ]]; then
        echo "Test data preparation completed."
        return 0
      fi

      echo "Test data preparation failed with exit code $exit_code."
      docker compose -f "$COMPOSE_FILE" logs --no-color init_test_data
      return "$exit_code"
    fi

    if [[ "$status" == "dead" ]]; then
      echo "The init_test_data container stopped unexpectedly."
      docker compose -f "$COMPOSE_FILE" logs --no-color init_test_data
      return 1
    fi

    sleep 2
  done

  echo "Timed out waiting for test data preparation."
  docker compose -f "$COMPOSE_FILE" logs --no-color init_test_data
  return 1
}

# Always remove the CI-mode stack, including when setup or tests fail.
trap cleanup EXIT

cd "$PROJECT_ROOT"

# A prior interrupted run must not leak database state into this run.
docker compose -f "$COMPOSE_FILE" down -v --remove-orphans

echo "Starting the E2E stack and preparing test data..."
docker compose -f "$COMPOSE_FILE" up -d --build ui init_test_data
wait_for_test_data

echo "Waiting for the UI..."
curl --insecure --fail --silent --show-error \
  --retry 60 --retry-delay 5 --retry-all-errors \
  https://localhost:13443/ > /dev/null

echo "Running the selected Playwright tests..."
if ! (
  cd "$PROJECT_ROOT/tests"
  npm test -- "$@"
); then
  echo "Playwright tests failed. E2E service logs follow."
  docker compose -f "$COMPOSE_FILE" logs --no-color
  exit 1
fi

echo "Selected Playwright tests passed."
