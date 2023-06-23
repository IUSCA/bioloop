// https://pm2.keymetrics.io/docs/usage/application-declaration/
module.exports = {
  apps: [
    {
      name: "celery_worker",
      script: "python",
      args: "-m celery -A workers.archive_celery_app worker --loglevel INFO -O fair --pidfile celery_worker.pid --hostname 'cpa-celery-archive-w1@%h' --autoscale=8,2 --queues 'archive.cpa.sca.iu.edu.q'",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/workers/celery_worker.err",
      out_file: "../logs/workers/celery_worker.log",
      kill_timeout: "10000"
    },
    {
      name: "watch",
      script: "python",
      args: "-u -m workers.scripts.watch",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/workers/watch.err",
      out_file: "../logs/workers/watch.log"
    }
  ]
}
