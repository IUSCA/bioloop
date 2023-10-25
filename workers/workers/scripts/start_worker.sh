#!/bin/bash

python -m celery \
  -A workers.celery_app worker \
  --loglevel INFO \
  -O fair \
  --pidfile celery_worker.pid \
  --hostname 'bioloop-celery-w1@%h' \
  --autoscale 8,3 \
  --queues 'bioloop-dev.sca.iu.edu.q' 
  # --detach
