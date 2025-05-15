python -m workers.scripts.create_data_directories
exec python -m celery \
  -A workers.celery_app worker \
  --loglevel INFO \
  -O fair \
  --pidfile celery_worker.pid \
  --hostname 'bioloop-celery-w1@%h' \
  --autoscale 4,1 \
  --queues 'bioloop-dev.sca.iu.edu.q' \
  --statedb 'state/state.db'