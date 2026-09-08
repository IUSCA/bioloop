// pm2 process list for running the workers natively on a developer machine.
//
//   cd workers
//   pm2 start ecosystem.dev.config.js
//   pm2 restart celery_worker
//   pm2 logs watch
//   pm2 delete ecosystem.dev.config.js
//
// See .claude/skills/workers-dev/SKILL.md for prerequisites and troubleshooting.
//
// Differences from ecosystem.config.js, which is the deployed process list:
//
//   - Only the three processes a developer needs. The nightly purge and metrics
//     crons are left out.
//   - `script` is the in-project poetry virtualenv rather than whatever python
//     happens to be on PATH.
//   - No `--pidfile` for celery. pm2 does not clear a stale pid file the way
//     bin/entrypoint.sh does, so a worker that crashed would refuse every
//     subsequent restart.
//   - `--autoscale=4,1`, because a laptop is not a worker host.

const path = require('path')

const cwd = __dirname
const python = path.join(cwd, '.venv', 'bin', 'python')
const logs = path.join(cwd, '..', 'logs', 'workers')

const common = {
  cwd,
  script: python,
  interpreter: '',
  watch: false,
  log_date_format: 'YYYY-MM-DD HH:mm Z',
  exp_backoff_restart_delay: 100,
  max_restarts: 3,
}

module.exports = {
  apps: [
    {
      ...common,
      name: 'celery_worker',
      args: "-m celery -A workers.celery_app worker --loglevel INFO -O fair "
        + "--hostname 'bioloop-dev-celery-w1@%h' --autoscale=4,1 "
        + "--queues 'bioloop-dev.sca.iu.edu.q'",
      error_file: path.join(logs, 'celery_worker.err'),
      out_file: path.join(logs, 'celery_worker.log'),
      kill_timeout: 10000,
    },
    {
      // watch_v2, not watch: every dataset it registers gets the owning group
      // configured for its watched directory. Never run both — they poll the same
      // directories and would race to register the same new subdirectory.
      ...common,
      name: 'watch',
      args: '-u -m workers.scripts.watch_v2',
      error_file: path.join(logs, 'watch.err'),
      out_file: path.join(logs, 'watch.log'),
    },
    {
      // Drives an upload from UPLOADED through verification to COMPLETE.
      // Nothing happens to a finished upload without this process.
      ...common,
      name: 'manage_upload_workflows',
      args: '-u -m workers.scripts.manage_upload_workflows --max-retries=3',
      error_file: path.join(logs, 'manage_upload_workflows.err'),
      out_file: path.join(logs, 'manage_upload_workflows.log'),
      cron_restart: '* * * * *',
      autorestart: false,
    },
  ],
}
