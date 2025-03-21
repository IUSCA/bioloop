#!/bin/bash

echo "test log"

# Set the log file path
LOG_FILE="/opt/sca/logs/metrics.log"

# Ensure the log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Run the metrics script and log its output
{
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting metrics script"
    python -u -m workers.scripts.metrics
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Metrics script completed"
} 2>&1 | tee -a "$LOG_FILE"