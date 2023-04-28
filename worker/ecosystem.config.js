// https://pm2.keymetrics.io/docs/usage/application-declaration/
module.exports = {
  apps: [
    {
      name: "celery_worker",
      script: "python",
      args: "-m celery -A scaworkers.celery_app worker --concurrency 8",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/worker/celery_worker.err",
      out_file: "../logs/worker/celery_worker.log"
    }, 
    {
      name: "register",
      script: "python",
      args: "-u -m scaworkers.scripts.register",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/worker/register.err",
      out_file: "../logs/worker/register.log"
    },
    {
      name: "watch_register",
      script: "python",
      args: "-u -m scaworkers.scripts.watch",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/worker/watch_register.err",
      out_file: "../logs/worker/watch_register.log"
    },
    {
      name: "metrics",
      script: "python",
      args: "-u -m scaworkers.scripts.metrics",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/worker/metrics.err",
      out_file: "../logs/worker/metrics.log",
      cron_restart: "0 * * * *",
      autorestart: false
    }
  ]
}
