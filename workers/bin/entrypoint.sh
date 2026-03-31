#!/bin/bash
set -e

# Worker service entrypoint.
#
# Selects the correct worker process based on the WORKER_TYPE environment
# variable, which is set per-service in docker-compose.yml.

echo "=== Workers entrypoint start (WORKER_TYPE=${WORKER_TYPE}) ==="

# Block until the API container has written APP_API_TOKEN to workers/.env.
# The API generates this JWT during its own startup; all Celery tasks need it
# to authenticate outbound requests to the API.
echo "Waiting for APP_API_TOKEN in .env..."
_WAIT_START=$(date +%s)
while [ ! -f ".env" ] || ! grep -q "^APP_API_TOKEN=[^ ]\+" ".env"; do
  echo "  [$(date '+%H:%M:%S')] Still waiting for .env / APP_API_TOKEN..."
  sleep 1
done
echo "APP_API_TOKEN ready (waited $(( $(date +%s) - _WAIT_START ))s)"

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo ".env loaded. Starting worker..."

if [ $WORKER_TYPE == "celery_worker" ]; then
  echo "Starting Celery Worker"
  CELERY_AUTOSCALE_MAX="${CELERY_AUTOSCALE_MAX:-16}"
  CELERY_AUTOSCALE_MIN="${CELERY_AUTOSCALE_MIN:-4}"
  echo "Celery autoscale configured to ${CELERY_AUTOSCALE_MAX},${CELERY_AUTOSCALE_MIN}"
  # Remove any stale PID file from a previous run.  Docker containers may be
  # restarted without a clean shutdown, leaving the file on the bind-mounted
  # volume.  Celery refuses to start if the PID file already exists.
  rm -f celery_worker.pid
  exec python -m celery \
    -A workers.celery_app worker \
    --loglevel INFO \
    -O fair \
    --pidfile celery_worker.pid \
    --hostname 'bioloop-celery-w1@%h' \
    --autoscale "${CELERY_AUTOSCALE_MAX},${CELERY_AUTOSCALE_MIN}" \
    --queues 'bioloop-dev.sca.iu.edu.q'
elif [ $WORKER_TYPE == "watch" ]; then
  echo "Starting Watch Worker"
  python -m workers.scripts.watch
elif [ $WORKER_TYPE == "metrics" ]; then
  echo "Starting Metrics Worker"
  python -m workers.scripts.metrics
elif [ $WORKER_TYPE == "purge_staged_datasets" ]; then
  echo "Starting Purge Staged Datasets Worker"
  python -m workers.scripts.purge_staged_datasets
elif [ $WORKER_TYPE == "purge_stale_workflows" ]; then
  echo "Starting Purge Stale Workflows Worker"
  python -m workers.scripts.purge_stale_workflows
else
  echo "ERROR: Invalid WORKER_TYPE='${WORKER_TYPE}'"
  exit 1
fi
