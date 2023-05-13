// https://pm2.keymetrics.io/docs/usage/application-declaration/
module.exports = {
  apps: [
    {
      name: "celery_worker",
      script: "python",
      args: "-m celery -A workers.celery_app worker --concurrency 8 --loglevel INFO -O fair",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/workers/celery_worker.err",
      out_file: "../logs/workers/celery_worker.log"
    },
    {
      name: "register",
      script: "python",
      args: "-u -m workers.scripts.register",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/workers/register.err",
      out_file: "../logs/workers/register.log"
    },
    {
      name: "watch_register",
      script: "python",
      args: "-u -m workers.scripts.watch",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/workers/watch_register.err",
      out_file: "../logs/workers/watch_register.log"
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
      cron_restart: "0 * * * *",
      autorestart: false
    }
  ]
}
