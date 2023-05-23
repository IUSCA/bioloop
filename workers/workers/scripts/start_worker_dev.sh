#!/bin/bash

python -m celery \
  -A tests.celery_app worker \
  --loglevel INFO \
  -O fair \
  --pidfile celery_worker.pid \
  --hostname 'dgl-dev-celery-w1@%h' \
  --autoscale 2,1 \
  --queues 'dgl-dev.sca.iu.edu.q'