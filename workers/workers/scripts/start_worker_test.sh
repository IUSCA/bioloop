#!/bin/bash

python -m celery \
  -A workers.celery_app worker \
  --loglevel INFO \
  -O fair \
  --pidfile celery_worker.pid \
  --hostname 'dgl-test-celery-w1@%h' \
  --autoscale 2,1 \
  --queues 'dgl-test.sca.iu.edu.q'