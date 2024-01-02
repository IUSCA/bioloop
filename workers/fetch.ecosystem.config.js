// https://pm2.keymetrics.io/docs/usage/application-declaration/
module.exports = {
  apps: [
    {
      name: "celery_worker",
      script: "/opt/sca/cpa/workers/.venv/bin/python",
      args: "-m celery -A workers.fetch_celery_app worker --loglevel INFO -O fair --pidfile celery_worker.pid --hostname 'cpa-celery-fetch-w1@%h' --autoscale=8,2 --queues 'fetch.cpa.sca.iu.edu.q'",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/workers/celery_worker.err",
      out_file: "../logs/workers/celery_worker.log",
      kill_timeout: "10000",
      exp_backoff_restart_delay: 100,
      max_restarts: 3,
    },
    {
      name: "metrics",
      script: "/opt/sca/cpa/workers/.venv/bin/python",
      args: "-u -m workers.scripts.metrics",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/workers/metrics.err",
      out_file: "../logs/workers/metrics.log",
      cron_restart: "00 21 * * *",
      autorestart: false,
      exp_backoff_restart_delay: 100,
      max_restarts: 3,
    },
    {
      name: "purge_staged_datasets",
      script: "/opt/sca/cpa/workers/.venv/bin/python",
      args: "-u -m workers.scripts.purge_staged_datasets",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/workers/purge_staged_datasets.err",
      out_file: "../logs/workers/purge_staged_datasets.log",
      cron_restart: "00 07 * * *",
      autorestart: false,
      exp_backoff_restart_delay: 100,
      max_restarts: 3,
    }
  ]
}
