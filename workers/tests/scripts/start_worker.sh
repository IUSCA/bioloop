#!/bin/bash

python -m celery \
  -A tests.celery_app worker \
  --loglevel INFO \
  -O fair \
  --pidfile celery_worker.pid \
  --hostname 'tests-celery@%h' \
  --autoscale 1,1 \
  --queues 'bioloop-dev.sca.iu.edu.q'