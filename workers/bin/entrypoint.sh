#!/bin/bash
set -e

_START_TIME=$(date +%s)
ts() { printf "[%s +%ds] " "$(date '+%H:%M:%S')" "$(( $(date +%s) - _START_TIME ))"; }

ts; echo "=== Workers entrypoint start (WORKER_TYPE=${WORKER_TYPE}) ==="

ts; echo "Waiting for APP_API_TOKEN in .env..."
_WAIT_START=$(date +%s)
while [ ! -f ".env" ] || ! grep -q "^APP_API_TOKEN=[^ ]\+" ".env"; do
  echo "  [$(date '+%H:%M:%S')] Still waiting for .env / APP_API_TOKEN..."
  sleep 1
done
ts; echo "APP_API_TOKEN ready (waited $(( $(date +%s) - _WAIT_START ))s)"

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

ts; echo ".env loaded. Starting worker..."

if [ $WORKER_TYPE == "celery_worker" ]; then
  ts; echo "Starting Celery Worker"
  rm -f celery_worker.pid
  exec python -m celery \
    -A workers.celery_app worker \
    --loglevel INFO \
    -O fair \
    --pidfile celery_worker.pid \
    --hostname 'bioloop-celery-w1@%h' \
    --autoscale 8,3 \
    --queues 'bioloop-dev.sca.iu.edu.q'
elif [ $WORKER_TYPE == "watch" ]; then
  ts; echo "Starting Watch Worker"
  python -m workers.scripts.watch
elif [ $WORKER_TYPE == "metrics" ]; then
  ts; echo "Starting Metrics Worker"
  python -m workers.scripts.metrics
elif [ $WORKER_TYPE == "purge_staged_datasets" ]; then
  ts; echo "Starting Purge Staged Datasets Worker"
  python -m workers.scripts.purge_staged_datasets
elif [ $WORKER_TYPE == "purge_stale_workflows" ]; then
  ts; echo "Starting Purge Stale Workflows Worker"
  python -m workers.scripts.purge_stale_workflows
elif [ $WORKER_TYPE == "manage_pending_dataset_uploads" ]; then
  ts; echo "Starting Manage Pending Dataset Uploads Worker"
  python -m workers.scripts.manage_pending_dataset_uploads
elif [ $WORKER_TYPE == "process_upload_dataset" ]; then
  ts; echo "Starting Process Upload Dataset Worker"
  python -m workers.scripts.process_upload_dataset
else
  echo "ERROR: Invalid WORKER_TYPE='${WORKER_TYPE}'"
  exit 1
fi
