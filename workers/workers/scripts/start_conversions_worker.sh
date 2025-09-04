#!/bin/bash

python -m celery \
  -A workers.conversions_app worker \
  --loglevel INFO \
  -O fair \
  --pidfile conversions_worker.pid \
  --hostname 'cfndap-celery-conversions-w1@%h' \
  --autoscale=8,2 \
  --queues 'conversions.cfndap.sca.iu.edu.q'
  --statedb=conversions_worker.state.db