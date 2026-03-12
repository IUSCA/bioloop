#!/bin/bash
# Runs manage_upload_workflows on a fixed interval in the foreground.
# Intended to be launched as a background process by entrypoint.sh.

INTERVAL=${UPLOAD_POLL_INTERVAL_SECONDS:-30}

while true; do
  sleep "$INTERVAL"
  echo "[$(date)] Running manage_upload_workflows..."
  python -u -m workers.scripts.manage_upload_workflows --dry-run=False --max-retries=3 2>&1 || true
done
