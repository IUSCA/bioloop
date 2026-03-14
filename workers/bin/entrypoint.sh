#!/bin/bash
set -e


echo "Waiting for .env file to be ready..."
while [ ! -f ".env" ] || ! grep -q "^APP_API_TOKEN=[^ ]\+" ".env"; do
  echo "Waiting for .env file to be ready and contain APP_API_TOKEN..."
  sleep 1
done


if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi


echo ".env file is ready. Starting the worker..."

# Start the appropriate worker based on the container invoking this entrypoint script
if [ $WORKER_TYPE == "celery_worker" ]; then
  echo "Starting Celery Worker"
  
  # Start the upload polling job in the background (runs every 30 seconds)
  echo "Starting upload polling job in background..."
  (
    while true; do
      sleep 30
      echo "[$(date)] Running manage_upload_workflows..."
      python -u -m workers.scripts.manage_upload_workflows --dry-run=False --max-retries=3 2>&1 || true
    done
  ) &
  POLLING_PID=$!
  echo "Upload polling job started with PID: $POLLING_PID"
  
  exec python -m celery \
    -A workers.celery_app worker \
    --loglevel INFO \
    -O fair \
    --pidfile celery_worker.pid \
    --hostname 'bioloop-celery-w1@%h' \
    --autoscale 8,3 \
    --queues 'bioloop-dev.sca.iu.edu.q'
      # --detach
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
elif [ $WORKER_TYPE == "manage_pending_dataset_uploads" ]; then
  echo "Starting Manage Pending Dataset Uploads Worker"
  python -m workers.scripts.manage_pending_dataset_uploads
elif [ $WORKER_TYPE == "process_upload_dataset" ]; then
  echo "Starting Process Upload Dataset Worker"
  python -m workers.scripts.process_upload_dataset
else
  echo "Invalid Worker Type"
fi
