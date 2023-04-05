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
      args: "-u -m scaworkers.workers.register",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/worker/register.err",
      out_file: "../logs/worker/register.log"
    }
  ]
}
