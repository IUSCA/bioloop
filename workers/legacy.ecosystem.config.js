// https://pm2.keymetrics.io/docs/usage/application-declaration/
module.exports = {
  apps: [
    {
      name: "celery_worker_legacy_data",
      script: "python",
      args: "-m celery -A workers.legacy_archive_celery_app worker --loglevel INFO -O fair --pidfile legacy_celery_worker.pid --hostname 'cpa-celery-legacy-archive-w1@%h' --autoscale=2,2 --queues 'legacy_archive.cpa.sca.iu.edu.q'",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/workers/legacy_celery_worker.err",
      out_file: "../logs/workers/legacy_celery_worker.log",
      kill_timeout: "10000",
      exp_backoff_restart_delay: 100,
      max_restarts: 3,
    },
    {
      name: "import_from_sda",
      script: "python",
      args: "-u -m workers.scripts.import_from_sda",
      watch: false,
      interpreter: "",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../logs/workers/import_from_sda.err",
      out_file: "../logs/workers/import_from_sda.log",
      exp_backoff_restart_delay: 100,
      max_restarts: 3,
    }
  ]
}
