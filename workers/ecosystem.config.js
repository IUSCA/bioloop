// https://pm2.keymetrics.io/docs/usage/application-declaration/
module.exports = {
  // replace script [python] with path of poetry's python executable
  apps: [
    {
      name: "celery_worker",
      script: "python",
      args: "-m celery -A workers.celery_app worker --loglevel INFO -O fair --pidfile celery_worker.pid --hostname 'bioloop-celery-w1@%h' --autoscale=8,2 --queues 'bioloop.sca.iu.edu.q'",
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
      name: "watch",
      script: "python",
      args: "-u -m workers.scripts.watch",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/workers/watch.err",
      out_file: "../logs/workers/watch.log",
      exp_backoff_restart_delay: 100,
      max_restarts: 3,
    },
    {
      name: "metrics",
      script: "python",
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
      script: "python",
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
    },
    {
      name: "purge_stale_workflows",
      script: "python",
      args: "-u -m workers.scripts.purge_stale_workflows",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/workers/purge_stale_workflows.err",
      out_file: "../logs/workers/purge_stale_workflows.log",
      cron_restart: "0 0 9 ? * MON,WED *",
      autorestart: false,
      exp_backoff_restart_delay: 100,
      max_restarts: 3,
    }
  ]
}
